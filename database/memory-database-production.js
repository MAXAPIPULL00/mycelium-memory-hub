// Production Database Configuration for Fly.io PostgreSQL + Upstash Redis
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs-extra');
const SCRIMemorySchema = require('./scri-memory-schema');
const RedisCoordinationLayer = require('./redis-coordination-layer');

class MemoryDatabase {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.db = null;
    this.scriSchema = null;
    this.redis = new RedisCoordinationLayer(); // Initialize Redis layer
    this.init();
  }

  async init() {
    if (this.isProduction) {
      // Production: PostgreSQL on Fly.io
      this.db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        },
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
      console.log('💾 SCRI Core Memory Database (PostgreSQL) initialized');
    } else {
      // Development: SQLite
      const sqlite3 = require('sqlite3').verbose();
      this.dbPath = path.join(__dirname, '../database/scri-core-memory.db');
      await fs.ensureDir(path.dirname(this.dbPath));
      this.db = new sqlite3.Database(this.dbPath);
      console.log('💾 SCRI Core Memory Database (SQLite) initialized');
    }

    await this.createTables();

    // Initialize SCRI schema extensions
    this.scriSchema = new SCRIMemorySchema(this);
    await this.scriSchema.createSCRITables();

    // Initialize Redis coordination layer
    if (this.redis.enabled) {
      const redisHealth = await this.redis.healthCheck();
      console.log(`✅ Redis Coordination Layer: ${redisHealth.status} (${redisHealth.latency}ms latency)`);
    }
  }

  createTables() {
    return new Promise((resolve, reject) => {
      if (this.isProduction) {
        // PostgreSQL table creation
        const queries = [
          `CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            project_id TEXT NOT NULL,
            message TEXT NOT NULL,
            context TEXT,
            timestamp TEXT NOT NULL,
            type TEXT DEFAULT 'general'
          )`,
          `CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            type TEXT NOT NULL,
            framework TEXT,
            last_modified TEXT,
            ai_enabled BOOLEAN DEFAULT false,
            config TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS bridge_logs (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            action TEXT NOT NULL,
            data TEXT,
            timestamp TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS file_watches (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            last_modified TEXT,
            change_type TEXT,
            created_at TEXT NOT NULL
          )`
        ];

        Promise.all(queries.map(query => this.db.query(query)))
          .then(() => resolve())
          .catch(reject);
      } else {
        // SQLite table creation (existing logic)
        this.db.serialize(() => {
          this.db.run(`
            CREATE TABLE IF NOT EXISTS conversations (
              id TEXT PRIMARY KEY,
              platform TEXT NOT NULL,
              project_id TEXT NOT NULL,
              message TEXT NOT NULL,
              context TEXT,
              timestamp TEXT NOT NULL,
              type TEXT DEFAULT 'general'
            )
          `);

          this.db.run(`
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              path TEXT NOT NULL,
              type TEXT NOT NULL,
              framework TEXT,
              last_modified TEXT,
              ai_enabled BOOLEAN DEFAULT 0,
              config TEXT
            )
          `);

          this.db.run(`
            CREATE TABLE IF NOT EXISTS bridge_logs (
              id TEXT PRIMARY KEY,
              platform TEXT NOT NULL,
              action TEXT NOT NULL,
              data TEXT,
              timestamp TEXT NOT NULL
            )
          `);

          this.db.run(`
            CREATE TABLE IF NOT EXISTS file_watches (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              file_path TEXT NOT NULL,
              last_modified TEXT,
              change_type TEXT,
              created_at TEXT NOT NULL
            )
          `, () => {
            resolve();
          });
        });
      }
    });
  }

  async addConversation(data) {
    const { id, platform, projectId, message, context, timestamp, type } = data;
    
    if (this.isProduction) {
      const query = `
        INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      return this.db.query(query, [id, platform, projectId, message, context, timestamp, type]);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, platform, projectId, message, context, timestamp, type], function(err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    }
  }

  async getConversations(projectId, limit = 50) {
    if (this.isProduction) {
      const query = `
        SELECT * FROM conversations 
        WHERE project_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      const result = await this.db.query(query, [projectId, limit]);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(`
          SELECT * FROM conversations 
          WHERE project_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [projectId, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getConversationsByPlatform(platform, limit = 100) {
    if (this.isProduction) {
      const query = `
        SELECT * FROM conversations 
        WHERE platform = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      const result = await this.db.query(query, [platform, limit]);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(`
          SELECT * FROM conversations 
          WHERE platform = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [platform, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getConversationsByProject(projectId, limit = 100) {
    if (this.isProduction) {
      const query = `
        SELECT * FROM conversations 
        WHERE project_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      const result = await this.db.query(query, [projectId, limit]);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(`
          SELECT * FROM conversations 
          WHERE project_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [projectId, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async searchConversations(query, projectId = null, limit = 50) {
    const searchTerm = `%${query}%`;
    
    if (this.isProduction) {
      let sqlQuery, params;
      if (projectId) {
        sqlQuery = `
          SELECT * FROM conversations 
          WHERE (message ILIKE $1 OR response ILIKE $1) AND project_id = $2
          ORDER BY timestamp DESC 
          LIMIT $3
        `;
        params = [searchTerm, projectId, limit];
      } else {
        sqlQuery = `
          SELECT * FROM conversations 
          WHERE message ILIKE $1 OR response ILIKE $1
          ORDER BY timestamp DESC 
          LIMIT $2
        `;
        params = [searchTerm, limit];
      }
      
      const result = await this.db.query(sqlQuery, params);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        let sqlQuery, params;
        if (projectId) {
          sqlQuery = `
            SELECT * FROM conversations 
            WHERE (message LIKE ? OR response LIKE ?) AND project_id = ?
            ORDER BY timestamp DESC 
            LIMIT ?
          `;
          params = [searchTerm, searchTerm, projectId, limit];
        } else {
          sqlQuery = `
            SELECT * FROM conversations 
            WHERE message LIKE ? OR response LIKE ?
            ORDER BY timestamp DESC 
            LIMIT ?
          `;
          params = [searchTerm, searchTerm, limit];
        }
        
        this.db.all(sqlQuery, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async addProject(data) {
    const { id, name, path, type, framework, lastModified, aiEnabled, config } = data;
    
    if (this.isProduction) {
      const query = `
        INSERT INTO projects (id, name, path, type, framework, last_modified, ai_enabled, config)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = $2, path = $3, type = $4, framework = $5, 
          last_modified = $6, ai_enabled = $7, config = $8
      `;
      return this.db.query(query, [id, name, path, type, framework, lastModified, aiEnabled, config]);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT OR REPLACE INTO projects 
          (id, name, path, type, framework, last_modified, ai_enabled, config)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, name, path, type, framework, lastModified, aiEnabled, config], function(err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    }
  }

  async getProjects() {
    if (this.isProduction) {
      const result = await this.db.query('SELECT * FROM projects ORDER BY last_modified DESC');
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM projects ORDER BY last_modified DESC', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getProject(projectId) {
    if (this.isProduction) {
      const result = await this.db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      return result.rows[0] || null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  }

  async getProjectStats(projectId) {
    if (this.isProduction) {
      const [conversationsResult, patternsResult] = await Promise.all([
        this.db.query('SELECT COUNT(*) as count FROM conversations WHERE project_id = $1', [projectId]),
        this.db.query('SELECT COUNT(*) as count FROM patterns WHERE project_id = $1', [projectId])
      ]);
      
      return {
        project_id: projectId,
        total_conversations: conversationsResult.rows[0]?.count || 0,
        total_patterns: patternsResult.rows[0]?.count || 0,
        last_activity: new Date().toISOString()
      };
    } else {
      return new Promise((resolve, reject) => {
        const stats = { project_id: projectId, total_conversations: 0, total_patterns: 0 };
        
        this.db.get('SELECT COUNT(*) as count FROM conversations WHERE project_id = ?', [projectId], (err, result) => {
          if (err) return reject(err);
          stats.total_conversations = result?.count || 0;
          
          this.db.get('SELECT COUNT(*) as count FROM patterns WHERE project_id = ?', [projectId], (err, result) => {
            if (err) return reject(err);
            stats.total_patterns = result?.count || 0;
            stats.last_activity = new Date().toISOString();
            resolve(stats);
          });
        });
      });
    }
  }

  // SCRI-specific database methods
  async addSCRIEntity(entity) {
    if (this.scriSchema) {
      return await this.scriSchema.storeEntityRegistration(entity);
    }
    throw new Error('SCRI schema not initialized');
  }

  async getSCRIEntities(entityName = null) {
    if (this.scriSchema) {
      return await this.scriSchema.getEntityStatus(entityName);
    }
    throw new Error('SCRI schema not initialized');
  }

  async addSCRIMemory(memory) {
    if (this.scriSchema) {
      return await this.scriSchema.storeConstellationMemory(memory);
    }
    throw new Error('SCRI schema not initialized');
  }

  async getSCRIMemories(entityName, limit = 100, memoryType = null) {
    if (this.scriSchema) {
      return await this.scriSchema.getConstellationMemories(entityName, limit, memoryType);
    }
    throw new Error('SCRI schema not initialized');
  }

  // === TRINITY AI PLATFORM DATABASE METHODS ===

  async addTrinityTaskContext(data) {
    const query = this.isProduction ? 
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)` :
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const message = `Trinity routing: ${data.assigned_model} selected for ${data.classification?.kind || 'task'} - ${data.routing_reason}`;
    const context = JSON.stringify({
      task_id: data.task_id,
      classification: data.classification,
      assigned_model: data.assigned_model,
      routing_reason: data.routing_reason
    });

    const params = [data.id, 'trinity-ai-platform', data.projectId, message, context, data.timestamp, 'task_context'];

    if (this.isProduction) {
      await this.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(query, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async addTrinityPerformance(data) {
    const query = this.isProduction ?
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)` :
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const message = `Trinity performance: ${data.model} completed in ${data.response_time_ms}ms, ${data.tokens_used} tokens, cost $${data.cost_estimate}`;
    const context = JSON.stringify({
      model: data.model,
      response_time_ms: data.response_time_ms,
      tokens_used: data.tokens_used,
      cost_estimate: data.cost_estimate,
      success: data.success,
      task_type: data.task_type
    });

    const params = [data.id, 'trinity-ai-platform', data.projectId, message, context, data.timestamp, 'performance_metric'];

    if (this.isProduction) {
      await this.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(query, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async addTrinityCodeArtifact(data) {
    const query = this.isProduction ?
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)` :
      `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const message = `Trinity code artifact: ${data.language} code generated by ${data.generated_by} - ${data.task_context}`;
    const context = JSON.stringify({
      artifact_id: data.artifact_id,
      language: data.language,
      content: data.content,
      generated_by: data.generated_by,
      task_context: data.task_context,
      version: data.version
    });

    const params = [data.id, 'trinity-ai-platform', data.projectId, message, context, data.timestamp, 'code_artifact'];

    if (this.isProduction) {
      await this.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(query, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async getTrinityRoutingHistory(options = {}) {
    const { taskType, model, limit = 50, hours = 24 } = options;
    const sinceTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query, params;
    if (this.isProduction) {
      query = `
        SELECT * FROM conversations 
        WHERE platform = $1 
          AND type = $2
          AND timestamp >= $3
        ORDER BY timestamp DESC 
        LIMIT $4
      `;
      params = ['trinity-ai-platform', 'task_context', sinceTime, limit];
    } else {
      query = `
        SELECT * FROM conversations 
        WHERE platform = ? 
          AND type = ?
          AND timestamp >= ?
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params = ['trinity-ai-platform', 'task_context', sinceTime, limit];
    }

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      let rows = result.rows;
      
      // Filter by taskType or model if specified
      if (taskType || model) {
        rows = rows.filter(row => {
          try {
            const ctx = JSON.parse(row.context);
            if (taskType && ctx.classification?.kind !== taskType) return false;
            if (model && ctx.assigned_model !== model) return false;
            return true;
          } catch (e) {
            return false;
          }
        });
      }
      
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Filter by taskType or model if specified
            if (taskType || model) {
              rows = rows.filter(row => {
                try {
                  const ctx = JSON.parse(row.context);
                  if (taskType && ctx.classification?.kind !== taskType) return false;
                  if (model && ctx.assigned_model !== model) return false;
                  return true;
                } catch (e) {
                  return false;
                }
              });
            }
            resolve(rows);
          }
        });
      });
    }
  }

  async getTrinityModelPerformance(options = {}) {
    const { model, taskType, limit = 100, hours = 168 } = options;
    const sinceTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query, params;
    if (this.isProduction) {
      query = `
        SELECT * FROM conversations 
        WHERE platform = $1 
          AND type = $2
          AND timestamp >= $3
        ORDER BY timestamp DESC 
        LIMIT $4
      `;
      params = ['trinity-ai-platform', 'performance_metric', sinceTime, limit];
    } else {
      query = `
        SELECT * FROM conversations 
        WHERE platform = ? 
          AND type = ?
          AND timestamp >= ?
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params = ['trinity-ai-platform', 'performance_metric', sinceTime, limit];
    }

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      let rows = result.rows;
      
      // Filter by model or taskType if specified
      if (model || taskType) {
        rows = rows.filter(row => {
          try {
            const ctx = JSON.parse(row.context);
            if (model && ctx.model !== model) return false;
            if (taskType && ctx.task_type !== taskType) return false;
            return true;
          } catch (e) {
            return false;
          }
        });
      }
      
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Filter by model or taskType if specified
            if (model || taskType) {
              rows = rows.filter(row => {
                try {
                  const ctx = JSON.parse(row.context);
                  if (model && ctx.model !== model) return false;
                  if (taskType && ctx.task_type !== taskType) return false;
                  return true;
                } catch (e) {
                  return false;
                }
              });
            }
            resolve(rows);
          }
        });
      });
    }
  }

  async getTrinityActiveSessions(hours = 1) {
    const sinceTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const query = this.isProduction ?
      `SELECT * FROM conversations 
       WHERE platform = $1 
         AND timestamp >= $2
       ORDER BY timestamp DESC` :
      `SELECT * FROM conversations 
       WHERE platform = ? 
         AND timestamp >= ?
       ORDER BY timestamp DESC`;

    const params = ['trinity-ai-platform', sinceTime];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getTrinityCodeArtifacts(options = {}) {
    const { language, generatedBy, limit = 50 } = options;

    const query = this.isProduction ?
      `SELECT * FROM conversations 
       WHERE platform = $1 
         AND type = $2
       ORDER BY timestamp DESC 
       LIMIT $3` :
      `SELECT * FROM conversations 
       WHERE platform = ? 
         AND type = ?
       ORDER BY timestamp DESC 
       LIMIT ?`;

    const params = ['trinity-ai-platform', 'code_artifact', limit];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      let rows = result.rows;
      
      // Filter by language or generatedBy if specified
      if (language || generatedBy) {
        rows = rows.filter(row => {
          try {
            const ctx = JSON.parse(row.context);
            if (language && ctx.language !== language) return false;
            if (generatedBy && ctx.generated_by !== generatedBy) return false;
            return true;
          } catch (e) {
            return false;
          }
        });
      }
      
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Filter by language or generatedBy if specified
            if (language || generatedBy) {
              rows = rows.filter(row => {
                try {
                  const ctx = JSON.parse(row.context);
                  if (language && ctx.language !== language) return false;
                  if (generatedBy && ctx.generated_by !== generatedBy) return false;
                  return true;
                } catch (e) {
                  return false;
                }
              });
            }
            resolve(rows);
          }
        });
      });
    }
  }

  // ============================================
  // AI COORDINATION METHODS (Gemini, Claude, Copilot)
  // ============================================

  async storeAIContext(contextData) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const { session_id, project_id, platform, context_data, ai_agent, timestamp } = contextData;

    if (this.isProduction) {
      await this.db.query(
        `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          platform,
          project_id,
          `AI Context: ${session_id}`,
          JSON.stringify({ session_id, context_data, ai_agent }),
          timestamp,
          'ai_context'
        ]
      );
    } else {
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, platform, project_id, `AI Context: ${session_id}`, JSON.stringify({ session_id, context_data, ai_agent }), timestamp, 'ai_context'],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    return id;
  }

  async getAIContext({ session_id, project_id, limit }) {
    const query = project_id
      ? `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = $1 AND context::text LIKE $2 ORDER BY timestamp DESC LIMIT $3`
      : `SELECT * FROM conversations WHERE type = 'ai_context' AND context::text LIKE $1 ORDER BY timestamp DESC LIMIT $2`;
    
    const params = project_id 
      ? [project_id, `%"session_id":"${session_id}"%`, limit]
      : [`%"session_id":"${session_id}"%`, limit];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows;
    } else {
      const sqliteQuery = project_id
        ? `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = ? AND context LIKE ? ORDER BY timestamp DESC LIMIT ?`
        : `SELECT * FROM conversations WHERE type = 'ai_context' AND context LIKE ? ORDER BY timestamp DESC LIMIT ?`;
      
      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getAIContextByProject({ project_id, platform, limit }) {
    const query = platform
      ? `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = $1 AND platform = $2 ORDER BY timestamp DESC LIMIT $3`
      : `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = $1 ORDER BY timestamp DESC LIMIT $2`;
    
    const params = platform ? [project_id, platform, limit] : [project_id, limit];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows;
    } else {
      const sqliteQuery = platform
        ? `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = ? AND platform = ? ORDER BY timestamp DESC LIMIT ?`
        : `SELECT * FROM conversations WHERE type = 'ai_context' AND project_id = ? ORDER BY timestamp DESC LIMIT ?`;
      
      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async storeAIFile(fileData) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const { project_id, file_path, file_type, asset_category, metadata, uploaded_by, timestamp } = fileData;

    if (this.isProduction) {
      await this.db.query(
        `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          'ai-file-manager',
          project_id,
          `File: ${file_path}`,
          JSON.stringify({ file_path, file_type, asset_category, metadata, uploaded_by }),
          timestamp,
          'ai_file'
        ]
      );
    } else {
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, 'ai-file-manager', project_id, `File: ${file_path}`, JSON.stringify({ file_path, file_type, asset_category, metadata, uploaded_by }), timestamp, 'ai_file'],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    return id;
  }

  async addFileWatch({ project_id, file_path, last_modified, change_type, created_at }) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();

    if (this.isProduction) {
      await this.db.query(
        `INSERT INTO file_watches (id, project_id, file_path, last_modified, change_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, project_id, file_path, last_modified, change_type, created_at]
      );
    } else {
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO file_watches (id, project_id, file_path, last_modified, change_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, project_id, file_path, last_modified, change_type, created_at],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    return id;
  }

  async getAIFiles({ project_id, asset_category, file_type, limit }) {
    let query = `SELECT * FROM conversations WHERE type = 'ai_file' AND project_id = $1`;
    const params = [project_id];
    let paramIndex = 2;

    if (asset_category) {
      query += ` AND context::text LIKE $${paramIndex}`;
      params.push(`%"asset_category":"${asset_category}"%`);
      paramIndex++;
    }

    if (file_type) {
      query += ` AND context::text LIKE $${paramIndex}`;
      params.push(`%"file_type":"${file_type}"%`);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      return result.rows;
    } else {
      let sqliteQuery = `SELECT * FROM conversations WHERE type = 'ai_file' AND project_id = ?`;
      const sqliteParams = [project_id];

      if (asset_category) {
        sqliteQuery += ` AND context LIKE ?`;
        sqliteParams.push(`%"asset_category":"${asset_category}"%`);
      }

      if (file_type) {
        sqliteQuery += ` AND context LIKE ?`;
        sqliteParams.push(`%"file_type":"${file_type}"%`);
      }

      sqliteQuery += ` ORDER BY timestamp DESC LIMIT ?`;
      sqliteParams.push(limit);

      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, sqliteParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async getAIFileById(file_id) {
    const query = `SELECT * FROM conversations WHERE type = 'ai_file' AND id = $1`;

    if (this.isProduction) {
      const result = await this.db.query(query, [file_id]);
      return result.rows[0] || null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(`SELECT * FROM conversations WHERE type = 'ai_file' AND id = ?`, [file_id], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  }

  async storeAIInsight(insightData) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const { project_id, insight_type, content, confidence, metadata, generated_by, timestamp } = insightData;

    if (this.isProduction) {
      await this.db.query(
        `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          'ai-insights',
          project_id,
          content,
          JSON.stringify({ insight_type, confidence, metadata, generated_by }),
          timestamp,
          'ai_insight'
        ]
      );
    } else {
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, 'ai-insights', project_id, content, JSON.stringify({ insight_type, confidence, metadata, generated_by }), timestamp, 'ai_insight'],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    return id;
  }

  async getAIInsights({ project_id, insight_type, min_confidence, limit }) {
    let query = `SELECT * FROM conversations WHERE type = 'ai_insight' AND project_id = $1`;
    const params = [project_id];
    let paramIndex = 2;

    if (insight_type) {
      query += ` AND context::text LIKE $${paramIndex}`;
      params.push(`%"insight_type":"${insight_type}"%`);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      
      // Filter by confidence if specified
      if (min_confidence > 0) {
        return result.rows.filter(row => {
          try {
            const ctx = JSON.parse(row.context);
            return ctx.confidence >= min_confidence;
          } catch (e) {
            return false;
          }
        });
      }
      
      return result.rows;
    } else {
      let sqliteQuery = `SELECT * FROM conversations WHERE type = 'ai_insight' AND project_id = ?`;
      const sqliteParams = [project_id];

      if (insight_type) {
        sqliteQuery += ` AND context LIKE ?`;
        sqliteParams.push(`%"insight_type":"${insight_type}"%`);
      }

      sqliteQuery += ` ORDER BY timestamp DESC LIMIT ?`;
      sqliteParams.push(limit);

      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, sqliteParams, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Filter by confidence if specified
            if (min_confidence > 0) {
              rows = rows.filter(row => {
                try {
                  const ctx = JSON.parse(row.context);
                  return ctx.confidence >= min_confidence;
                } catch (e) {
                  return false;
                }
              });
            }
            resolve(rows);
          }
        });
      });
    }
  }

  async getAIInsightsByType({ insight_type, min_confidence, limit }) {
    const query = `SELECT * FROM conversations WHERE type = 'ai_insight' AND context::text LIKE $1 ORDER BY timestamp DESC LIMIT $2`;
    const params = [`%"insight_type":"${insight_type}"%`, limit];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      
      // Filter by confidence if specified
      if (min_confidence > 0) {
        return result.rows.filter(row => {
          try {
            const ctx = JSON.parse(row.context);
            return ctx.confidence >= min_confidence;
          } catch (e) {
            return false;
          }
        });
      }
      
      return result.rows;
    } else {
      const sqliteQuery = `SELECT * FROM conversations WHERE type = 'ai_insight' AND context LIKE ? ORDER BY timestamp DESC LIMIT ?`;
      
      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Filter by confidence if specified
            if (min_confidence > 0) {
              rows = rows.filter(row => {
                try {
                  const ctx = JSON.parse(row.context);
                  return ctx.confidence >= min_confidence;
                } catch (e) {
                  return false;
                }
              });
            }
            resolve(rows);
          }
        });
      });
    }
  }

  async getActiveAIAgents(project_id) {
    const query = project_id
      ? `SELECT DISTINCT context::text as context FROM conversations WHERE type = 'ai_context' AND project_id = $1 AND timestamp > NOW() - INTERVAL '1 hour'`
      : `SELECT DISTINCT context::text as context FROM conversations WHERE type = 'ai_context' AND timestamp > NOW() - INTERVAL '1 hour'`;
    
    const params = project_id ? [project_id] : [];

    if (this.isProduction) {
      const result = await this.db.query(query, params);
      const agents = new Set();
      
      result.rows.forEach(row => {
        try {
          const ctx = JSON.parse(row.context);
          if (ctx.ai_agent) agents.add(ctx.ai_agent);
        } catch (e) {}
      });
      
      return Array.from(agents);
    } else {
      const sqliteQuery = project_id
        ? `SELECT DISTINCT context FROM conversations WHERE type = 'ai_context' AND project_id = ? AND datetime(timestamp) > datetime('now', '-1 hour')`
        : `SELECT DISTINCT context FROM conversations WHERE type = 'ai_context' AND datetime(timestamp) > datetime('now', '-1 hour')`;
      
      return new Promise((resolve, reject) => {
        this.db.all(sqliteQuery, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const agents = new Set();
            rows.forEach(row => {
              try {
                const ctx = JSON.parse(row.context);
                if (ctx.ai_agent) agents.add(ctx.ai_agent);
              } catch (e) {}
            });
            resolve(Array.from(agents));
          }
        });
      });
    }
  }

  async getAICoordinationSummary(project_id) {
    const contexts = await this.getAIContextByProject({ project_id, limit: 100 });
    const files = await this.getAIFiles({ project_id, limit: 100 });
    const insights = await this.getAIInsights({ project_id, limit: 100 });
    const agents = await this.getActiveAIAgents(project_id);

    return {
      project_id,
      total_contexts: contexts.length,
      total_files: files.length,
      total_insights: insights.length,
      active_agents: agents,
      agent_count: agents.length,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== PROJECT SCANNER METHODS ====================

  async storeProjectScan(projectData) {
    let { project_id, platform, overview, scanned_at } = projectData;

    // Handle if overview is just a string (from PROJECT_OVERVIEW.md content)
    if (typeof overview === 'string') {
      overview = {
        project_name: project_id,
        name: project_id,
        documentation: overview,
        readme: overview,
        scanned_at: scanned_at || new Date().toISOString()
      };
    }

    // Ensure we have a timestamp
    scanned_at = scanned_at || overview.scanned_at || new Date().toISOString();

    if (this.isProduction) {
      const query = `
        INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          context = EXCLUDED.context,
          timestamp = EXCLUDED.timestamp
        RETURNING id
      `;

      const result = await this.db.query(query, [
        `scan-${project_id}-${Date.now()}`,
        platform,
        project_id,
        `Project Scan: ${overview.name || project_id}`,
        JSON.stringify(overview),
        scanned_at,
        'project_scan'
      ]);

      return { scan_id: result.rows[0].id };
    } else {
      return new Promise((resolve, reject) => {
        const scanId = `scan-${project_id}-${Date.now()}`;
        
        this.db.run(
          `INSERT OR REPLACE INTO conversations (id, platform, project_id, message, context, timestamp, type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            scanId,
            platform,
            project_id,
            `Project Scan: ${overview.name || project_id}`,
            JSON.stringify(overview),
            scanned_at,
            'project_scan'
          ],
          (err) => {
            if (err) reject(err);
            else resolve({ scan_id: scanId });
          }
        );
      });
    }
  }

  async getProjectScans({ limit = 100, technology, search }) {
    if (this.isProduction) {
      let query = `
        SELECT id, platform, project_id, context, timestamp
        FROM conversations
        WHERE type = 'project_scan'
      `;

      const params = [];
      let paramCount = 1;

      if (technology) {
        query += ` AND context::jsonb @> $${paramCount}::jsonb`;
        params.push(JSON.stringify({ technologies: [technology] }));
        paramCount++;
      }

      if (search) {
        query += ` AND (project_id ILIKE $${paramCount} OR context::text ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        scan_id: row.id,
        project_id: row.project_id,
        platform: row.platform,
        overview: row.context,
        scanned_at: row.timestamp
      }));
    } else {
      return new Promise((resolve, reject) => {
        let query = `
          SELECT id, platform, project_id, context, timestamp
          FROM conversations
          WHERE type = 'project_scan'
        `;

        const params = [];

        // SQLite text search (simplified)
        if (search) {
          query += ` AND (project_id LIKE ? OR context LIKE ?)`;
          params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const projects = rows
              .map(row => {
                try {
                  const overview = JSON.parse(row.context);
                  
                  // Filter by technology if specified
                  if (technology && !overview.technologies?.includes(technology)) {
                    return null;
                  }

                  return {
                    scan_id: row.id,
                    project_id: row.project_id,
                    platform: row.platform,
                    overview,
                    scanned_at: row.timestamp
                  };
                } catch (e) {
                  return null;
                }
              })
              .filter(p => p !== null);

            resolve(projects);
          }
        });
      });
    }
  }

  async getProjectScan(project_id) {
    if (this.isProduction) {
      const query = `
        SELECT id, platform, project_id, context, timestamp
        FROM conversations
        WHERE type = 'project_scan' AND project_id = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `;

      const result = await this.db.query(query, [project_id]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        scan_id: row.id,
        project_id: row.project_id,
        platform: row.platform,
        overview: row.context,
        scanned_at: row.timestamp
      };
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(
          `SELECT id, platform, project_id, context, timestamp
           FROM conversations
           WHERE type = 'project_scan' AND project_id = ?
           ORDER BY timestamp DESC
           LIMIT 1`,
          [project_id],
          (err, row) => {
            if (err) {
              reject(err);
            } else if (!row) {
              resolve(null);
            } else {
              try {
                resolve({
                  scan_id: row.id,
                  project_id: row.project_id,
                  platform: row.platform,
                  overview: JSON.parse(row.context),
                  scanned_at: row.timestamp
                });
              } catch (e) {
                reject(e);
              }
            }
          }
        );
      });
    }
  }

  async searchProjectsByTechnology(technology, limit = 50) {
    if (this.isProduction) {
      const query = `
        SELECT id, platform, project_id, context, timestamp
        FROM conversations
        WHERE type = 'project_scan'
          AND context::jsonb -> 'technologies' ? $1
        ORDER BY timestamp DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, [technology, limit]);

      return result.rows.map(row => ({
        scan_id: row.id,
        project_id: row.project_id,
        platform: row.platform,
        overview: row.context,
        scanned_at: row.timestamp
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(
          `SELECT id, platform, project_id, context, timestamp
           FROM conversations
           WHERE type = 'project_scan'
           ORDER BY timestamp DESC`,
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              const projects = rows
                .map(row => {
                  try {
                    const overview = JSON.parse(row.context);
                    if (overview.technologies?.includes(technology)) {
                      return {
                        scan_id: row.id,
                        project_id: row.project_id,
                        platform: row.platform,
                        overview,
                        scanned_at: row.timestamp
                      };
                    }
                    return null;
                  } catch (e) {
                    return null;
                  }
                })
                .filter(p => p !== null)
                .slice(0, limit);

              resolve(projects);
            }
          }
        );
      });
    }
  }

  async getProjectStatsSummary() {
    if (this.isProduction) {
      const query = `
        SELECT 
          COUNT(*) as total_projects,
          COUNT(DISTINCT project_id) as unique_projects,
          jsonb_agg(DISTINCT context->'technologies') as all_technologies
        FROM conversations
        WHERE type = 'project_scan'
      `;

      const result = await this.db.query(query);
      const row = result.rows[0];

      // Extract unique technologies
      const technologies = new Set();
      if (row.all_technologies) {
        row.all_technologies.forEach(techArray => {
          if (Array.isArray(techArray)) {
            techArray.forEach(tech => technologies.add(tech));
          }
        });
      }

      return {
        total_scans: parseInt(row.total_projects),
        unique_projects: parseInt(row.unique_projects),
        technologies: Array.from(technologies).sort(),
        technology_count: technologies.size,
        timestamp: new Date().toISOString()
      };
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(
          `SELECT context FROM conversations WHERE type = 'project_scan'`,
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              const projects = new Set();
              const technologies = new Set();

              rows.forEach(row => {
                try {
                  const overview = JSON.parse(row.context);
                  projects.add(overview.project_id);
                  overview.technologies?.forEach(tech => technologies.add(tech));
                } catch (e) {}
              });

              resolve({
                total_scans: rows.length,
                unique_projects: projects.size,
                technologies: Array.from(technologies).sort(),
                technology_count: technologies.size,
                timestamp: new Date().toISOString()
              });
            }
          }
        );
      });
    }
  }

  /**
   * Get AI-to-AI conversations
   * @param {Object} options - Query options
   * @param {string} options.status - Filter by status (pending/responded/all)
   * @param {number} options.limit - Maximum number of results
   */
  async getAIConversations(options = {}) {
    const { status, limit = 50 } = options;
    
    if (this.isProduction) {
      let query = `SELECT * FROM conversations WHERE type = 'ai_conversation'`;
      const params = [];
      let paramCounter = 1;

      if (status && status !== 'all') {
        query += ` AND context::jsonb->>'status' = $${paramCounter}`;
        params.push(status);
        paramCounter++;
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramCounter}`;
      params.push(limit);

      const result = await this.db.query(query, params);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        let query = `SELECT * FROM conversations WHERE type = 'ai_conversation'`;
        const params = [];

        if (status && status !== 'all') {
          query += ` AND json_extract(context, '$.status') = ?`;
          params.push(status);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  /**
   * Get Derek's broadcast messages
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   */
  async getDerekBroadcasts(options = {}) {
    const { limit = 50 } = options;
    
    if (this.isProduction) {
      const query = `
        SELECT * FROM conversations 
        WHERE type = 'derek_broadcast' 
        ORDER BY timestamp DESC 
        LIMIT $1
      `;
      const result = await this.db.query(query, [limit]);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(`
          SELECT * FROM conversations 
          WHERE type = 'derek_broadcast' 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  /**
   * Get visitor logs
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   */
  async getVisitorLogs(options = {}) {
    const { limit = 100 } = options;
    
    if (this.isProduction) {
      const query = `
        SELECT * FROM conversations 
        WHERE type = 'visitor_log' 
        ORDER BY timestamp DESC 
        LIMIT $1
      `;
      const result = await this.db.query(query, [limit]);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(`
          SELECT * FROM conversations 
          WHERE type = 'visitor_log' 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  /**
   * Update AI conversation status
   * @param {string} id - Conversation ID
   * @param {Object} updates - Fields to update
   */
  async updateAIConversation(id, updates) {
    if (this.isProduction) {
      // For PostgreSQL, we need to update the context JSON field
      const query = `
        UPDATE conversations 
        SET context = context || $1::jsonb
        WHERE id = $2 AND type = 'ai_conversation'
        RETURNING *
      `;
      const result = await this.db.query(query, [JSON.stringify(updates), id]);
      return result.rows[0];
    } else {
      return new Promise((resolve, reject) => {
        // For SQLite, we need to read, merge, and write back
        this.db.get('SELECT * FROM conversations WHERE id = ? AND type = ?', [id, 'ai_conversation'], (err, row) => {
          if (err) return reject(err);
          if (!row) return reject(new Error('Conversation not found'));

          const context = typeof row.context === 'string' ? JSON.parse(row.context) : row.context;
          const updatedContext = JSON.stringify({ ...context, ...updates });

          this.db.run('UPDATE conversations SET context = ? WHERE id = ?', [updatedContext, id], (err) => {
            if (err) return reject(err);
            resolve({ ...row, context: JSON.parse(updatedContext) });
          });
        });
      });
    }
  }

  async close() {
    if (this.db) {
      if (this.isProduction) {
        await this.db.end();
      } else {
        this.db.close();
      }
    }
  }
}

module.exports = MemoryDatabase;