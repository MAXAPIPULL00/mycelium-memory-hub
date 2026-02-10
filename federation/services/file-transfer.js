// Federation Hub v2 - File Transfer Service
// Task 18: Binary File Transfer Implementation
// Requirements: 12.1-12.7

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class FederationFileTransfer {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // File storage directory (Fly.io volume)
    this.storageDir = process.env.FILE_STORAGE_DIR || '/data/files';
    
    // Max file size: 100MB
    this.maxFileSize = 100 * 1024 * 1024;
    
    // Resumable upload threshold: 10MB
    this.resumableThreshold = 10 * 1024 * 1024;
    
    // Active upload sessions
    this.uploadSessions = new Map();
  }

  async initialize() {
    // Ensure storage directory exists
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.log('⚠️ Could not create file storage directory:', error.message);
    }
    console.log('📁 File Transfer service initialized');
  }

  // Requirement 12.1: Upload file (multipart)
  async uploadFile(fileData, metadata) {
    const { filename, content_type, from_node, to_node, ephemeral } = metadata;
    
    // Requirement 12.4: Enforce size limit
    const fileSize = Buffer.byteLength(fileData);
    if (fileSize > this.maxFileSize) {
      return {
        success: false,
        error: 'file_too_large',
        message: `File size ${fileSize} exceeds maximum ${this.maxFileSize} bytes (100MB)`
      };
    }

    const fileId = uuidv4();
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    const storagePath = path.join(this.storageDir, fileId);

    // Requirement 12.2: Store on Fly.io volume
    try {
      await fs.writeFile(storagePath, fileData);
    } catch (error) {
      return { success: false, error: 'storage_error', message: error.message };
    }

    // Store metadata in database
    const fileRecord = {
      file_id: fileId,
      filename,
      content_type: content_type || 'application/octet-stream',
      size: fileSize,
      hash: fileHash,
      from_node,
      to_node: to_node || '*',
      ephemeral: ephemeral || false,
      storage_path: storagePath,
      created_at: new Date().toISOString()
    };

    try {
      await this.db.run(`
        INSERT INTO federation_files 
        (file_id, filename, content_type, size, hash, from_node, to_node, ephemeral, storage_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fileRecord.file_id,
        fileRecord.filename,
        fileRecord.content_type,
        fileRecord.size,
        fileRecord.hash,
        fileRecord.from_node,
        fileRecord.to_node,
        fileRecord.ephemeral ? 1 : 0,
        fileRecord.storage_path,
        fileRecord.created_at
      ]);
    } catch (error) {
      // Clean up file on database error
      await fs.unlink(storagePath).catch(() => {});
      return { success: false, error: 'database_error', message: error.message };
    }

    return {
      success: true,
      file_id: fileId,
      filename,
      size: fileSize,
      hash: fileHash
    };
  }

  // Requirement 12.3, 12.5: Download file (streaming, ephemeral consumption)
  async downloadFile(fileId, requestingNode) {
    try {
      const row = await this.db.get(`
        SELECT * FROM federation_files 
        WHERE file_id = ? AND (to_node = ? OR to_node = '*')
      `, [fileId, requestingNode]);

      if (!row) {
        return { success: false, error: 'not_found', message: 'File not found or unauthorized' };
      }

      // Read file content
      const content = await fs.readFile(row.storage_path);

      // Requirement 12.5: Ephemeral files deleted after consumption
      if (row.ephemeral) {
        await this.deleteFile(fileId);
      }

      return {
        success: true,
        file_id: row.file_id,
        filename: row.filename,
        content_type: row.content_type,
        size: row.size,
        content
      };
    } catch (error) {
      return { success: false, error: 'read_error', message: error.message };
    }
  }

  // Get file stream (for large files)
  async getFileStream(fileId, requestingNode) {
    try {
      const row = await this.db.get(`
        SELECT * FROM federation_files 
        WHERE file_id = ? AND (to_node = ? OR to_node = '*')
      `, [fileId, requestingNode]);

      if (!row) {
        return null;
      }

      const { createReadStream } = require('fs');
      return {
        stream: createReadStream(row.storage_path),
        metadata: {
          filename: row.filename,
          content_type: row.content_type,
          size: row.size
        }
      };
    } catch (error) {
      return null;
    }
  }

  // Requirement 12.6: Create resumable upload session
  async createUploadSession(metadata) {
    const { filename, content_type, total_size, from_node, to_node } = metadata;

    // Check size limit
    if (total_size > this.maxFileSize) {
      return {
        success: false,
        error: 'file_too_large',
        message: `File size ${total_size} exceeds maximum ${this.maxFileSize} bytes`
      };
    }

    const sessionId = uuidv4();
    const chunkSize = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(total_size / chunkSize);

    const session = {
      session_id: sessionId,
      filename,
      content_type,
      total_size,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      uploaded_chunks: new Set(),
      from_node,
      to_node,
      created_at: new Date().toISOString(),
      temp_path: path.join(this.storageDir, `temp_${sessionId}`)
    };

    this.uploadSessions.set(sessionId, session);

    // Create temp file
    await fs.writeFile(session.temp_path, Buffer.alloc(0));

    return {
      success: true,
      session_id: sessionId,
      chunk_size: chunkSize,
      total_chunks: totalChunks
    };
  }

  // Upload chunk for resumable upload
  async uploadChunk(sessionId, chunkIndex, chunkData) {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'session_not_found' };
    }

    if (chunkIndex >= session.total_chunks) {
      return { success: false, error: 'invalid_chunk_index' };
    }

    // Write chunk at correct offset
    const offset = chunkIndex * session.chunk_size;
    const fd = await fs.open(session.temp_path, 'r+');
    await fd.write(chunkData, 0, chunkData.length, offset);
    await fd.close();

    session.uploaded_chunks.add(chunkIndex);

    // Check if upload is complete
    if (session.uploaded_chunks.size === session.total_chunks) {
      return await this.finalizeUpload(sessionId);
    }

    return {
      success: true,
      chunks_uploaded: session.uploaded_chunks.size,
      chunks_remaining: session.total_chunks - session.uploaded_chunks.size
    };
  }

  // Finalize resumable upload
  async finalizeUpload(sessionId) {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'session_not_found' };
    }

    // Read complete file and create permanent record
    const fileData = await fs.readFile(session.temp_path);
    
    const result = await this.uploadFile(fileData, {
      filename: session.filename,
      content_type: session.content_type,
      from_node: session.from_node,
      to_node: session.to_node
    });

    // Clean up temp file and session
    await fs.unlink(session.temp_path).catch(() => {});
    this.uploadSessions.delete(sessionId);

    return result;
  }

  // Delete file
  async deleteFile(fileId) {
    try {
      const row = await this.db.get(`SELECT storage_path FROM federation_files WHERE file_id = ?`, [fileId]);
      
      if (row) {
        await fs.unlink(row.storage_path).catch(() => {});
        await this.db.run(`DELETE FROM federation_files WHERE file_id = ?`, [fileId]);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Requirement 12.7: List files (metadata only)
  async listFiles(nodeId, options = {}) {
    const { limit = 100, from_node = null } = options;

    try {
      let query = `
        SELECT file_id, filename, content_type, size, hash, from_node, to_node, ephemeral, created_at
        FROM federation_files 
        WHERE (to_node = ? OR to_node = '*')
      `;
      const params = [nodeId];

      if (from_node) {
        query += ` AND from_node = ?`;
        params.push(from_node);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      const rows = await this.db.all(query, params);

      return (rows || []).map(row => ({
        file_id: row.file_id,
        filename: row.filename,
        content_type: row.content_type,
        size: row.size,
        hash: row.hash,
        from_node: row.from_node,
        ephemeral: row.ephemeral === 1,
        created_at: row.created_at
        // Note: content is NOT included
      }));
    } catch (error) {
      return [];
    }
  }

  // Get upload session status
  getUploadSession(sessionId) {
    return this.uploadSessions.get(sessionId) || null;
  }
}

module.exports = FederationFileTransfer;
