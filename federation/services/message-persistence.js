// Federation Hub v2 - Message Persistence Service
// Task 17: Message Persistence & TTL Implementation
// Requirements: 11.1-11.7

const { v4: uuidv4 } = require('uuid');

class FederationMessagePersistence {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // Default TTL: 7 days in milliseconds
    this.defaultTTL = 7 * 24 * 60 * 60 * 1000;
    
    // Cleanup interval: 60 seconds
    this.cleanupInterval = null;
  }

  async initialize() {
    // Start cleanup job
    this.startCleanupJob();
    console.log('💾 Message Persistence service initialized');
  }

  // Requirement 11.1: Store message with TTL
  async storeMessage(message) {
    const messageId = message.id || uuidv4();
    const now = new Date();
    
    // Calculate expiration
    const ttlMs = message.ttl_seconds ? message.ttl_seconds * 1000 : this.defaultTTL;
    const expiresAt = new Date(now.getTime() + ttlMs);

    const storedMessage = {
      message_id: messageId,
      from_node: message.from_node,
      to_node: message.to_node,
      channel: message.channel || null,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      content_type: message.content_type || 'application/json',
      ephemeral: message.ephemeral || false,
      ttl_seconds: message.ttl_seconds || Math.floor(this.defaultTTL / 1000),
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
      consumed: false
    };

    // Persist to database
    try {
      await this.db.run(`
        INSERT INTO federation_messages 
        (message_id, from_node, to_node, channel, content, content_type, ephemeral, ttl_seconds, expires_at, created_at, consumed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        storedMessage.message_id,
        storedMessage.from_node,
        storedMessage.to_node,
        storedMessage.channel,
        storedMessage.content,
        storedMessage.content_type,
        storedMessage.ephemeral ? 1 : 0,
        storedMessage.ttl_seconds,
        storedMessage.expires_at,
        storedMessage.created_at,
        0
      ]);
    } catch (error) {
      console.error('Failed to store message:', error);
      throw error;
    }

    return storedMessage;
  }

  // Requirement 11.2, 11.4: Retrieve message (ephemeral = delete after read)
  async getMessage(messageId, requestingNode) {
    try {
      const row = await this.db.get(`
        SELECT * FROM federation_messages 
        WHERE message_id = ? AND (to_node = ? OR to_node = '*' OR to_node IS NULL)
      `, [messageId, requestingNode]);

      if (!row) {
        return null;
      }

      // Check if expired
      if (new Date(row.expires_at) < new Date()) {
        await this.deleteMessage(messageId);
        return null;
      }

      // Requirement 11.4: Ephemeral messages deleted after consumption
      if (row.ephemeral) {
        await this.deleteMessage(messageId);
      } else {
        // Mark as consumed
        await this.db.run(`
          UPDATE federation_messages SET consumed = 1 WHERE message_id = ?
        `, [messageId]);
      }

      return {
        message_id: row.message_id,
        from_node: row.from_node,
        to_node: row.to_node,
        channel: row.channel,
        content: row.content,
        content_type: row.content_type,
        ephemeral: row.ephemeral === 1,
        expires_at: row.expires_at,
        created_at: row.created_at
      };
    } catch (error) {
      console.error('Failed to get message:', error);
      return null;
    }
  }

  // Get messages for a node
  async getMessagesForNode(nodeId, options = {}) {
    const { limit = 100, channel = null, includeExpired = false } = options;
    
    try {
      let query = `
        SELECT * FROM federation_messages 
        WHERE (to_node = ? OR to_node = '*' OR to_node IS NULL)
      `;
      const params = [nodeId];

      if (!includeExpired) {
        query += ` AND expires_at > datetime('now')`;
      }

      if (channel) {
        query += ` AND channel = ?`;
        params.push(channel);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      const rows = await this.db.all(query, params);

      // Requirement 11.6: Include expires_at in responses
      return (rows || []).map(row => ({
        message_id: row.message_id,
        from_node: row.from_node,
        to_node: row.to_node,
        channel: row.channel,
        content: row.content,
        content_type: row.content_type,
        ephemeral: row.ephemeral === 1,
        expires_at: row.expires_at,
        created_at: row.created_at,
        consumed: row.consumed === 1
      }));
    } catch (error) {
      console.error('Failed to get messages for node:', error);
      return [];
    }
  }

  // Delete a message
  async deleteMessage(messageId) {
    try {
      await this.db.run(`DELETE FROM federation_messages WHERE message_id = ?`, [messageId]);
      return true;
    } catch (error) {
      console.error('Failed to delete message:', error);
      return false;
    }
  }

  // Requirement 11.5, 11.7: Cleanup job - purge expired messages
  startCleanupJob() {
    // Run every 60 seconds
    this.cleanupInterval = setInterval(async () => {
      await this.purgeExpiredMessages();
    }, 60 * 1000);

    // Run immediately on start
    this.purgeExpiredMessages();
  }

  async purgeExpiredMessages() {
    try {
      const result = await this.db.run(`
        DELETE FROM federation_messages WHERE expires_at < datetime('now')
      `);
      
      if (result && result.changes > 0) {
        console.log(`🧹 Purged ${result.changes} expired messages`);
      }
    } catch (error) {
      // Table may not exist yet
    }
  }

  stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Get message stats
  async getStats() {
    try {
      const total = await this.db.get(`SELECT COUNT(*) as count FROM federation_messages`);
      const expired = await this.db.get(`
        SELECT COUNT(*) as count FROM federation_messages WHERE expires_at < datetime('now')
      `);
      const ephemeral = await this.db.get(`
        SELECT COUNT(*) as count FROM federation_messages WHERE ephemeral = 1
      `);

      return {
        total: total?.count || 0,
        expired: expired?.count || 0,
        ephemeral: ephemeral?.count || 0
      };
    } catch (error) {
      return { total: 0, expired: 0, ephemeral: 0 };
    }
  }
}

module.exports = FederationMessagePersistence;
