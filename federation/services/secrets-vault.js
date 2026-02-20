// Federation Hub v2 - Secrets Vault Service
// Task 15: P2 Secrets Vault Implementation
// Requirements: 10.1-10.6

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FederationSecretsVault {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;

    // Resolve encryption key with persistence
    this.encryptionKey = this._resolveEncryptionKey();

    // In-memory cache of secret metadata (not values)
    this.secretsMetadata = new Map();
  }

  _resolveEncryptionKey() {
    // 1. Environment variable (highest priority)
    if (process.env.SECRETS_ENCRYPTION_KEY) {
      return process.env.SECRETS_ENCRYPTION_KEY;
    }

    // 2. Persisted key file
    const keyFilePath = path.join(
      process.env.FEDERATION_DATA_DIR || './data',
      '.secrets-vault-key'
    );

    if (fs.existsSync(keyFilePath)) {
      const key = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (key.length === 64) {
        console.warn(
          'WARNING: Using persisted encryption key from file. ' +
          'Set SECRETS_ENCRYPTION_KEY env var for production.'
        );
        return key;
      }
    }

    // 3. Generate and persist new key
    const newKey = crypto.randomBytes(32).toString('hex');
    try {
      const dir = path.dirname(keyFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(keyFilePath, newKey, { mode: 0o600 });
      console.warn(
        'WARNING: Generated new encryption key and saved to ' + keyFilePath + '. ' +
        'Set SECRETS_ENCRYPTION_KEY env var for production.'
      );
    } catch (err) {
      console.error('CRITICAL: Could not persist encryption key:', err.message);
      console.error('Secrets encrypted this session will be lost on restart!');
    }
    return newKey;
  }

  async initialize() {
    await this.loadSecretsMetadata();
    console.log('🔒 Secrets Vault service initialized');
  }

  async loadSecretsMetadata() {
    try {
      const secrets = await this.db.all(`
        SELECT secret_id, name, authorized_nodes, created_at, updated_at, created_by
        FROM federation_secrets
      `);
      
      for (const secret of secrets || []) {
        this.secretsMetadata.set(secret.secret_id, {
          secret_id: secret.secret_id,
          name: secret.name,
          authorized_nodes: JSON.parse(secret.authorized_nodes || '[]'),
          created_at: secret.created_at,
          updated_at: secret.updated_at,
          created_by: secret.created_by
        });
      }
    } catch (error) {
      console.log('⚠️ Secrets table not ready');
    }
  }

  // Encrypt a value
  encrypt(plaintext) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.encryptionKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  // Decrypt a value
  decrypt(encryptedData) {
    const key = Buffer.from(this.encryptionKey, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Requirement 10.1: Store encrypted secret
  async storeSecret(name, value, authorizedNodes, createdBy) {
    const secretId = uuidv4();
    
    // Encrypt the value
    const encryptedData = this.encrypt(value);
    
    const metadata = {
      secret_id: secretId,
      name,
      authorized_nodes: authorizedNodes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: createdBy
    };

    this.secretsMetadata.set(secretId, metadata);

    // Persist to database
    try {
      await this.db.run(`
        INSERT INTO federation_secrets 
        (secret_id, name, encrypted_value, iv, auth_tag, authorized_nodes, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        secretId,
        name,
        encryptedData.encrypted,
        encryptedData.iv,
        encryptedData.authTag,
        JSON.stringify(authorizedNodes),
        metadata.created_at,
        metadata.updated_at,
        createdBy
      ]);
    } catch (error) {
      console.error('Failed to store secret:', error);
      throw error;
    }

    return {
      secret_id: secretId,
      name,
      authorized_nodes: authorizedNodes
    };
  }

  // Requirement 10.2: Retrieve secret (with authorization check)
  async getSecret(secretId, requestingNode) {
    const metadata = this.secretsMetadata.get(secretId);
    
    if (!metadata) {
      return { success: false, error: 'Secret not found' };
    }

    // Check authorization
    if (!metadata.authorized_nodes.includes(requestingNode) && 
        !metadata.authorized_nodes.includes('*')) {
      return { 
        success: false, 
        error: 'Unauthorized access',
        reason: `Node ${requestingNode} is not authorized to access this secret`
      };
    }

    // Retrieve encrypted value from database
    try {
      const row = await this.db.get(`
        SELECT encrypted_value, iv, auth_tag FROM federation_secrets WHERE secret_id = ?
      `, [secretId]);

      if (!row) {
        return { success: false, error: 'Secret not found in storage' };
      }

      // Decrypt
      const value = this.decrypt({
        encrypted: row.encrypted_value,
        iv: row.iv,
        authTag: row.auth_tag
      });

      // Log access (for audit)
      await this.logAccess(secretId, requestingNode, 'read');

      return {
        success: true,
        secret_id: secretId,
        name: metadata.name,
        value
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Requirement 10.4: List secrets (metadata only, no values)
  listSecrets(requestingNode = null) {
    const secrets = [];
    
    for (const [, metadata] of this.secretsMetadata) {
      // If requesting node specified, only show authorized secrets
      if (requestingNode) {
        if (!metadata.authorized_nodes.includes(requestingNode) && 
            !metadata.authorized_nodes.includes('*')) {
          continue;
        }
      }

      secrets.push({
        secret_id: metadata.secret_id,
        name: metadata.name,
        authorized_nodes: metadata.authorized_nodes,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at
        // Note: value is NOT included
      });
    }

    return secrets;
  }

  // Requirement 10.5: Rotate secret
  async rotateSecret(secretId, newValue, requestingNode) {
    const metadata = this.secretsMetadata.get(secretId);
    
    if (!metadata) {
      return { success: false, error: 'Secret not found' };
    }

    // Only creator or authorized nodes can rotate
    if (metadata.created_by !== requestingNode && 
        !metadata.authorized_nodes.includes(requestingNode)) {
      return { success: false, error: 'Unauthorized to rotate this secret' };
    }

    // Encrypt new value
    const encryptedData = this.encrypt(newValue);
    
    metadata.updated_at = new Date().toISOString();
    this.secretsMetadata.set(secretId, metadata);

    // Update database
    try {
      await this.db.run(`
        UPDATE federation_secrets 
        SET encrypted_value = ?, iv = ?, auth_tag = ?, updated_at = ?
        WHERE secret_id = ?
      `, [
        encryptedData.encrypted,
        encryptedData.iv,
        encryptedData.authTag,
        metadata.updated_at,
        secretId
      ]);

      // Log rotation
      await this.logAccess(secretId, requestingNode, 'rotate');

      return { success: true, secret_id: secretId, rotated_at: metadata.updated_at };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Requirement 10.6: Delete secret
  async deleteSecret(secretId, requestingNode) {
    const metadata = this.secretsMetadata.get(secretId);
    
    if (!metadata) {
      return { success: false, error: 'Secret not found' };
    }

    // Only creator can delete
    if (metadata.created_by !== requestingNode) {
      return { success: false, error: 'Only the creator can delete this secret' };
    }

    this.secretsMetadata.delete(secretId);

    // Delete from database
    try {
      await this.db.run(`DELETE FROM federation_secrets WHERE secret_id = ?`, [secretId]);
      
      // Log deletion
      await this.logAccess(secretId, requestingNode, 'delete');

      return { success: true, secret_id: secretId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update authorized nodes
  async updateAuthorization(secretId, authorizedNodes, requestingNode) {
    const metadata = this.secretsMetadata.get(secretId);
    
    if (!metadata) {
      return { success: false, error: 'Secret not found' };
    }

    // Only creator can update authorization
    if (metadata.created_by !== requestingNode) {
      return { success: false, error: 'Only the creator can update authorization' };
    }

    metadata.authorized_nodes = authorizedNodes;
    metadata.updated_at = new Date().toISOString();
    this.secretsMetadata.set(secretId, metadata);

    // Update database
    try {
      await this.db.run(`
        UPDATE federation_secrets 
        SET authorized_nodes = ?, updated_at = ?
        WHERE secret_id = ?
      `, [
        JSON.stringify(authorizedNodes),
        metadata.updated_at,
        secretId
      ]);

      return { success: true, secret_id: secretId, authorized_nodes: authorizedNodes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Log access for audit
  async logAccess(secretId, nodeId, action) {
    try {
      await this.db.run(`
        INSERT INTO federation_secret_access_log 
        (secret_id, node_id, action, timestamp)
        VALUES (?, ?, ?, ?)
      `, [secretId, nodeId, action, new Date().toISOString()]);
    } catch (error) {
      // Log table may not exist
      console.log('⚠️ Could not log secret access:', error.message);
    }
  }
}

module.exports = FederationSecretsVault;
