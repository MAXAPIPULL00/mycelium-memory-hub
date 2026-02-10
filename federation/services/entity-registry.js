// Federation Hub v2 - Entity Registry Service
// Task 37: Entity Registration Persistence
// Requirements: 28.1-28.4, 20.1, 20.6

const { v4: uuidv4 } = require('uuid');

class FederationEntityRegistry {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.io = federationHub.io;
    this.isProduction = federationHub.db.isProduction;
    
    // In-memory cache
    this.entities = new Map();
  }

  async initialize() {
    console.log('🏛️ Initializing Entity Registry...');
    await this.restoreEntities();
    console.log(`✅ Entity Registry initialized with ${this.entities.size} entities`);
  }

  // Requirement 28.2: Restore entities on hub restart
  async restoreEntities() {
    const query = 'SELECT * FROM federation_registered_entities';
    
    try {
      if (this.isProduction) {
        const result = await this.db.db.query(query);
        result.rows.forEach(row => {
          this.entities.set(row.entity_id, this.parseEntityRow(row));
        });
      } else {
        return new Promise((resolve, reject) => {
          this.db.db.all(query, [], (err, rows) => {
            if (err) {
              // Table might not exist yet
              console.log('⚠️ Entity registry table not ready yet');
              resolve();
            } else {
              (rows || []).forEach(row => {
                this.entities.set(row.entity_id, this.parseEntityRow(row));
              });
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.log('⚠️ Entity registry table not ready yet');
    }
  }

  parseEntityRow(row) {
    return {
      entity_id: row.entity_id,
      name: row.name,
      type: row.type,
      capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities || '[]') : row.capabilities,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata,
      registered_at: row.registered_at,
      last_seen: row.last_seen,
      status: 'offline' // Will be updated when entity connects
    };
  }

  // Requirement 20.1, 28.1: Handle entity registration
  async handleRegistration(socket, data) {
    const { entity_id, name, type, capabilities, metadata } = data;
    
    if (!entity_id) {
      socket.emit('entity:error', { error: 'entity_id is required' });
      return;
    }
    
    const now = new Date().toISOString();
    const isNew = !this.entities.has(entity_id);
    
    const entity = {
      entity_id,
      name: name || entity_id,
      type: type || 'ai',
      capabilities: capabilities || [],
      metadata: metadata || {},
      registered_at: isNew ? now : this.entities.get(entity_id)?.registered_at || now,
      last_seen: now,
      status: 'online',
      socket_id: socket.id
    };
    
    // Persist to database (Requirement 28.1)
    await this.persistEntity(entity);
    
    // Update cache
    this.entities.set(entity_id, entity);
    
    // Store socket mapping
    socket.entity_id = entity_id;
    socket.join('entities');
    socket.join(`entity:${entity_id}`);
    
    // Record join event (Requirement 26)
    await this.recordJoinEvent(entity);
    
    // Send confirmation
    socket.emit('entity:registered', {
      success: true,
      entity_id,
      registered_at: entity.registered_at
    });
    
    // Broadcast entity list to all clients (Requirement 20.3)
    await this.broadcastEntityList();
    
    // Emit event (Requirement 28.4)
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.entity.registered',
        data: { entity_id, name: entity.name, type: entity.type, capabilities }
      });
    }
    
    console.log(`✅ Entity '${entity_id}' registered`);
  }

  // Persist entity to database
  async persistEntity(entity) {
    const query = this.isProduction ?
      `INSERT INTO federation_registered_entities (entity_id, name, type, capabilities, metadata, registered_at, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_id) DO UPDATE SET
         name = $2, type = $3, capabilities = $4, metadata = $5, last_seen = $7` :
      `INSERT OR REPLACE INTO federation_registered_entities (entity_id, name, type, capabilities, metadata, registered_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      entity.entity_id,
      entity.name,
      entity.type,
      JSON.stringify(entity.capabilities),
      JSON.stringify(entity.metadata),
      entity.registered_at,
      entity.last_seen
    ];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Record join event for Nexus UI
  async recordJoinEvent(entity) {
    const id = uuidv4();
    const query = this.isProduction ?
      `INSERT INTO federation_join_events (id, entity_id, entity_name, entity_type, capabilities, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6)` :
      `INSERT INTO federation_join_events (id, entity_id, entity_name, entity_type, capabilities, joined_at)
       VALUES (?, ?, ?, ?, ?, ?)`;
    
    const params = [
      id,
      entity.entity_id,
      entity.name,
      entity.type,
      JSON.stringify(entity.capabilities),
      entity.last_seen
    ];
    
    try {
      if (this.isProduction) {
        await this.db.db.query(query, params);
      } else {
        return new Promise((resolve, reject) => {
          this.db.db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      console.error('Failed to record join event:', error);
    }
    
    // Emit via WebSocket for real-time alerts (Requirement 26.3)
    if (this.io) {
      this.io.to('entities').emit('entity:joined', {
        entity_id: entity.entity_id,
        entity_name: entity.name,
        entity_type: entity.type,
        capabilities: entity.capabilities,
        joined_at: entity.last_seen
      });
    }
  }

  // Requirement 20.2, 20.3: Broadcast entity list
  async broadcastEntityList() {
    const entities = this.getEntitiesInAthenaFormat();
    
    if (this.io) {
      this.io.to('entities').emit('entities:list', {
        entities,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Requirement 20.2: Broadcast entity status change
  async broadcastEntityStatus(entityId, status) {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    
    entity.status = status;
    entity.last_seen = new Date().toISOString();
    
    if (this.io) {
      this.io.to('entities').emit('entity:status', {
        entity_id: entityId,
        status,
        timestamp: entity.last_seen
      });
    }
  }

  // Handle entity disconnect
  async handleDisconnect(socket) {
    const entityId = socket.entity_id;
    if (!entityId) return;
    
    const entity = this.entities.get(entityId);
    if (entity) {
      entity.status = 'offline';
      entity.last_seen = new Date().toISOString();
      
      // Update database
      await this.updateLastSeen(entityId);
      
      // Broadcast status change
      await this.broadcastEntityStatus(entityId, 'offline');
      
      // Emit event (Requirement 28.4)
      if (this.hub.eventBus) {
        await this.hub.eventBus.emit({
          event_type: 'federation.entity.unregistered',
          data: { entity_id: entityId }
        });
      }
    }
  }

  // Requirement 28.3: Update last_seen
  async updateLastSeen(entityId) {
    const now = new Date().toISOString();
    const query = this.isProduction ?
      `UPDATE federation_registered_entities SET last_seen = $1 WHERE entity_id = $2` :
      `UPDATE federation_registered_entities SET last_seen = ? WHERE entity_id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [now, entityId]);
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.run(query, [now, entityId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Requirement 20.6: Get entities in AthenaEntity format
  getEntitiesInAthenaFormat() {
    return Array.from(this.entities.values()).map(entity => ({
      entity_id: entity.entity_id,
      name: entity.name,
      type: entity.type,
      status: entity.status || 'offline',
      capabilities: entity.capabilities,
      location: entity.metadata?.location,
      last_seen: entity.last_seen
    }));
  }

  // Get all entities
  getEntities() {
    return Array.from(this.entities.values());
  }

  // Get entity by ID
  getEntity(entityId) {
    return this.entities.get(entityId);
  }

  // Get statistics
  async getStats() {
    const entities = Array.from(this.entities.values());
    return {
      total: entities.length,
      online: entities.filter(e => e.status === 'online').length,
      offline: entities.filter(e => e.status === 'offline').length
    };
  }

  // Get recent join events (Requirement 26.1)
  async getJoinEvents(limit = 20) {
    const query = this.isProduction ?
      `SELECT * FROM federation_join_events ORDER BY joined_at DESC LIMIT $1` :
      `SELECT * FROM federation_join_events ORDER BY joined_at DESC LIMIT ?`;
    
    if (this.isProduction) {
      const result = await this.db.db.query(query, [limit]);
      return result.rows.map(row => ({
        ...row,
        capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.all(query, [limit], (err, rows) => {
          if (err) reject(err);
          else {
            resolve((rows || []).map(row => ({
              ...row,
              capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities
            })));
          }
        });
      });
    }
  }
}

module.exports = FederationEntityRegistry;
