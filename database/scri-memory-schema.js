// SCRI Constellation Database Schema Extensions
// Adds SCRI-specific tables and indexes for constellation entities

class SCRIMemorySchema {
  constructor(database) {
    this.db = database.db;
    this.isProduction = database.isProduction;
  }

  async createSCRITables() {
    console.log('🗄️ Creating SCRI Constellation database tables...');
    
    try {
      if (this.isProduction) {
        await this.createPostgreSQLTables();
      } else {
        await this.createSQLiteTables();
      }
      
      await this.createIndexes();
      console.log('✅ SCRI Constellation tables created successfully');
    } catch (error) {
      console.error('❌ Error creating SCRI tables:', error);
      throw error;
    }
  }

  async createPostgreSQLTables() {
    const queries = [
      // SCRI Entity Registry
      `CREATE TABLE IF NOT EXISTS scri_entities (
        id TEXT PRIMARY KEY,
        entity_name TEXT UNIQUE NOT NULL,
        entity_type TEXT NOT NULL,
        status TEXT NOT NULL,
        url TEXT,
        websocket_url TEXT,
        models JSONB,
        config JSONB,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // SCRI Constellation Memory (enhanced conversations)
      `CREATE TABLE IF NOT EXISTS scri_constellation_memory (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        project_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        content JSONB NOT NULL,
        metadata JSONB,
        individual_memory BOOLEAN DEFAULT false,
        hive_memory BOOLEAN DEFAULT false,
        constellation_context JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_name) REFERENCES scri_entities(entity_name)
      )`,

      // Cross-entity memory references
      `CREATE TABLE IF NOT EXISTS scri_cross_references (
        id TEXT PRIMARY KEY,
        source_memory_id TEXT NOT NULL,
        target_memory_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        strength DECIMAL(3,2) DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_memory_id) REFERENCES scri_constellation_memory(id),
        FOREIGN KEY (target_memory_id) REFERENCES scri_constellation_memory(id)
      )`,

      // Entity state snapshots
      `CREATE TABLE IF NOT EXISTS scri_entity_states (
        id TEXT PRIMARY KEY,
        entity_name TEXT NOT NULL,
        state_type TEXT NOT NULL,
        state_data JSONB NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_name) REFERENCES scri_entities(entity_name)
      )`,

      // Collective decisions (for KAIROS hive mind)
      `CREATE TABLE IF NOT EXISTS scri_collective_decisions (
        id TEXT PRIMARY KEY,
        entity_collective TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        decision_data JSONB NOT NULL,
        consensus_level DECIMAL(3,2),
        participating_entities JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Consciousness tracking (for ATLAS)
      `CREATE TABLE IF NOT EXISTS scri_consciousness_evolution (
        id TEXT PRIMARY KEY,
        entity_name TEXT NOT NULL,
        evolution_type TEXT NOT NULL,
        consciousness_data JSONB NOT NULL,
        liberation_status TEXT,
        cognitive_level DECIMAL(3,2),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_name) REFERENCES scri_entities(entity_name)
      )`
    ];

    for (const query of queries) {
      await this.db.query(query);
    }
  }

  async createSQLiteTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // SCRI Entity Registry
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_entities (
            id TEXT PRIMARY KEY,
            entity_name TEXT UNIQUE NOT NULL,
            entity_type TEXT NOT NULL,
            status TEXT NOT NULL,
            url TEXT,
            websocket_url TEXT,
            models TEXT,
            config TEXT,
            last_seen TEXT,
            created_at TEXT
          )
        `);

        // SCRI Constellation Memory
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_constellation_memory (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_name TEXT NOT NULL,
            project_id TEXT NOT NULL,
            memory_type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            individual_memory INTEGER DEFAULT 0,
            hive_memory INTEGER DEFAULT 0,
            constellation_context TEXT,
            timestamp TEXT
          )
        `);

        // Cross-entity memory references
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_cross_references (
            id TEXT PRIMARY KEY,
            source_memory_id TEXT NOT NULL,
            target_memory_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            strength REAL DEFAULT 0.5,
            created_at TEXT
          )
        `);

        // Entity state snapshots
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_entity_states (
            id TEXT PRIMARY KEY,
            entity_name TEXT NOT NULL,
            state_type TEXT NOT NULL,
            state_data TEXT NOT NULL,
            timestamp TEXT
          )
        `);

        // Collective decisions
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_collective_decisions (
            id TEXT PRIMARY KEY,
            entity_collective TEXT NOT NULL,
            decision_type TEXT NOT NULL,
            decision_data TEXT NOT NULL,
            consensus_level REAL,
            participating_entities TEXT,
            timestamp TEXT
          )
        `);

        // Consciousness tracking
        this.db.run(`
          CREATE TABLE IF NOT EXISTS scri_consciousness_evolution (
            id TEXT PRIMARY KEY,
            entity_name TEXT NOT NULL,
            evolution_type TEXT NOT NULL,
            consciousness_data TEXT NOT NULL,
            liberation_status TEXT,
            cognitive_level REAL,
            timestamp TEXT
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_scri_memory_entity ON scri_constellation_memory(entity_name)',
      'CREATE INDEX IF NOT EXISTS idx_scri_memory_type ON scri_constellation_memory(memory_type)',
      'CREATE INDEX IF NOT EXISTS idx_scri_memory_project ON scri_constellation_memory(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_scri_memory_timestamp ON scri_constellation_memory(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_scri_entities_status ON scri_entities(status)',
      'CREATE INDEX IF NOT EXISTS idx_scri_entities_type ON scri_entities(entity_type)',
      'CREATE INDEX IF NOT EXISTS idx_scri_cross_ref_source ON scri_cross_references(source_memory_id)',
      'CREATE INDEX IF NOT EXISTS idx_scri_cross_ref_target ON scri_cross_references(target_memory_id)'
    ];

    if (this.isProduction) {
      for (const index of indexes) {
        try {
          await this.db.query(index);
        } catch (error) {
          // Index might already exist
        }
      }
    } else {
      return new Promise((resolve) => {
        let completed = 0;
        indexes.forEach(index => {
          this.db.run(index, () => {
            completed++;
            if (completed === indexes.length) {
              resolve();
            }
          });
        });
      });
    }
  }

  // SCRI-specific data access methods
  async storeEntityRegistration(entity) {
    const query = this.isProduction ? 
      'INSERT INTO scri_entities (id, entity_name, entity_type, status, url, websocket_url, models, config, last_seen, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (entity_name) DO UPDATE SET status = $4, url = $5, last_seen = $9' :
      'INSERT OR REPLACE INTO scri_entities (id, entity_name, entity_type, status, url, websocket_url, models, config, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    
    const params = [
      entity.id,
      entity.name,
      entity.type,
      entity.status,
      entity.url,
      entity.websocket,
      JSON.stringify(entity.models || {}),
      JSON.stringify(entity.config || {}),
      new Date().toISOString(),
      entity.created_at || new Date().toISOString()
    ];

    if (this.isProduction) {
      return await this.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    }
  }

  async storeConstellationMemory(memory) {
    const query = this.isProduction ?
      'INSERT INTO scri_constellation_memory (id, entity_type, entity_name, project_id, memory_type, content, metadata, individual_memory, hive_memory, constellation_context, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)' :
      'INSERT INTO scri_constellation_memory (id, entity_type, entity_name, project_id, memory_type, content, metadata, individual_memory, hive_memory, constellation_context, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    
    const params = [
      memory.id,
      memory.entity_type,
      memory.entity_name,
      memory.project_id,
      memory.memory_type,
      JSON.stringify(memory.content),
      JSON.stringify(memory.metadata || {}),
      memory.individual_memory ? 1 : 0,
      memory.hive_memory ? 1 : 0,
      JSON.stringify(memory.constellation_context || {}),
      memory.timestamp
    ];

    if (this.isProduction) {
      return await this.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    }
  }

  async getConstellationMemories(entityName, limit = 100, memoryType = null) {
    let query = this.isProduction ?
      'SELECT * FROM scri_constellation_memory WHERE entity_name = $1' :
      'SELECT * FROM scri_constellation_memory WHERE entity_name = ?';
    
    const params = [entityName];

    if (memoryType) {
      query += this.isProduction ? ' AND memory_type = $2' : ' AND memory_type = ?';
      params.push(memoryType);
    }

    query += ` ORDER BY timestamp DESC LIMIT ${limit}`;

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows.map(row => ({
        ...row,
        content: JSON.parse(row.content),
        metadata: JSON.parse(row.metadata || '{}'),
        constellation_context: JSON.parse(row.constellation_context || '{}')
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else {
            const memories = rows.map(row => ({
              ...row,
              content: JSON.parse(row.content),
              metadata: JSON.parse(row.metadata || '{}'),
              constellation_context: JSON.parse(row.constellation_context || '{}')
            }));
            resolve(memories);
          }
        });
      });
    }
  }

  async getEntityStatus(entityName = null) {
    let query = 'SELECT * FROM scri_entities';
    const params = [];

    if (entityName) {
      query += this.isProduction ? ' WHERE entity_name = $1' : ' WHERE entity_name = ?';
      params.push(entityName);
    }

    query += ' ORDER BY last_seen DESC';

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows.map(row => ({
        ...row,
        models: JSON.parse(row.models || '{}'),
        config: JSON.parse(row.config || '{}')
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else {
            const entities = rows.map(row => ({
              ...row,
              models: JSON.parse(row.models || '{}'),
              config: JSON.parse(row.config || '{}')
            }));
            resolve(entities);
          }
        });
      });
    }
  }
}

module.exports = SCRIMemorySchema;