// Federation Hub v2 - Access Control Service
// Task 32: Nexus UI Access Control Implementation
// Requirements: 23.1-23.7

const { v4: uuidv4 } = require('uuid');

class FederationAccessControl {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.isProduction = federationHub.db.isProduction;
    
    // In-memory caches
    this.blocklist = new Set();
    this.allowlist = new Set();
    this.mode = 'open'; // 'open', 'allowlist_only', 'blocklist'
  }

  async initialize() {
    console.log('🔐 Initializing Access Control...');
    await this.loadAccessLists();
    console.log('✅ Access Control initialized');
  }

  async loadAccessLists() {
    try {
      // Load blocklist
      const blockQuery = 'SELECT entity_id FROM federation_access_blocklist';
      if (this.isProduction) {
        const result = await this.db.db.query(blockQuery);
        result.rows.forEach(row => this.blocklist.add(row.entity_id));
      } else {
        await new Promise((resolve, reject) => {
          this.db.db.all(blockQuery, [], (err, rows) => {
            if (err) resolve(); // Table might not exist
            else {
              (rows || []).forEach(row => this.blocklist.add(row.entity_id));
              resolve();
            }
          });
        });
      }
      
      // Load allowlist
      const allowQuery = 'SELECT entity_id FROM federation_access_allowlist';
      if (this.isProduction) {
        const result = await this.db.db.query(allowQuery);
        result.rows.forEach(row => this.allowlist.add(row.entity_id));
      } else {
        await new Promise((resolve, reject) => {
          this.db.db.all(allowQuery, [], (err, rows) => {
            if (err) resolve(); // Table might not exist
            else {
              (rows || []).forEach(row => this.allowlist.add(row.entity_id));
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.log('⚠️ Access control tables not ready yet');
    }
  }

  // Check if entity is allowed to communicate
  isAllowed(entityId) {
    // If on blocklist, reject (Requirement 23.2)
    if (this.blocklist.has(entityId)) {
      return false;
    }
    
    // If allowlist mode and not on allowlist, reject
    if (this.mode === 'allowlist_only' && this.allowlist.size > 0) {
      return this.allowlist.has(entityId);
    }
    
    return true;
  }

  // Requirement 23.1: Get blocked entities
  async getBlockedEntities() {
    return {
      blocked: Array.from(this.blocklist),
      count: this.blocklist.size
    };
  }

  // Requirement 23.2: Block entity
  async blockEntity(entityId, blockedBy = 'system') {
    this.blocklist.add(entityId);
    
    const query = this.isProduction ?
      `INSERT INTO federation_access_blocklist (entity_id, blocked_by, blocked_at)
       VALUES ($1, $2, $3) ON CONFLICT (entity_id) DO NOTHING` :
      `INSERT OR IGNORE INTO federation_access_blocklist (entity_id, blocked_by, blocked_at)
       VALUES (?, ?, ?)`;
    
    const params = [entityId, blockedBy, new Date().toISOString()];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    return {
      success: true,
      entity_id: entityId,
      action: 'blocked'
    };
  }

  // Requirement 23.3: Unblock entity
  async unblockEntity(entityId) {
    this.blocklist.delete(entityId);
    
    const query = this.isProduction ?
      `DELETE FROM federation_access_blocklist WHERE entity_id = $1` :
      `DELETE FROM federation_access_blocklist WHERE entity_id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [entityId]);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, [entityId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    return {
      success: true,
      entity_id: entityId,
      action: 'unblocked'
    };
  }

  // Requirement 23.4: Get allowed entities
  async getAllowedEntities() {
    return {
      allowed: Array.from(this.allowlist),
      count: this.allowlist.size
    };
  }

  // Requirement 23.5: Allow entity
  async allowEntity(entityId, allowedBy = 'system') {
    this.allowlist.add(entityId);
    
    const query = this.isProduction ?
      `INSERT INTO federation_access_allowlist (entity_id, allowed_by, allowed_at)
       VALUES ($1, $2, $3) ON CONFLICT (entity_id) DO NOTHING` :
      `INSERT OR IGNORE INTO federation_access_allowlist (entity_id, allowed_by, allowed_at)
       VALUES (?, ?, ?)`;
    
    const params = [entityId, allowedBy, new Date().toISOString()];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    return {
      success: true,
      entity_id: entityId,
      action: 'allowed'
    };
  }

  // Requirement 23.6: Remove from allowlist
  async removeAllowedEntity(entityId) {
    this.allowlist.delete(entityId);
    
    const query = this.isProduction ?
      `DELETE FROM federation_access_allowlist WHERE entity_id = $1` :
      `DELETE FROM federation_access_allowlist WHERE entity_id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [entityId]);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, [entityId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    return {
      success: true,
      entity_id: entityId,
      action: 'removed'
    };
  }

  // Requirement 23.7: Reset to open mode
  async resetAccessControl() {
    this.blocklist.clear();
    this.allowlist.clear();
    this.mode = 'open';
    
    // Clear database tables
    const blockQuery = 'DELETE FROM federation_access_blocklist';
    const allowQuery = 'DELETE FROM federation_access_allowlist';
    
    if (this.isProduction) {
      await this.db.db.query(blockQuery);
      await this.db.db.query(allowQuery);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(blockQuery, [], (err) => {
          if (err) reject(err);
          else {
            this.db.db.run(allowQuery, [], (err2) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }
    
    return {
      success: true,
      entity_id: null,
      action: 'reset'
    };
  }
}

module.exports = FederationAccessControl;
