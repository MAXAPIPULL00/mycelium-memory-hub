// Memory Database - SQLite storage for SCRI Core Memory conversations and context
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

class MemoryDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, '../database/scri-core-memory.db');
    this.db = null;
    this.init();
  }

  async init() {
    // Ensure database directory exists
    await fs.ensureDir(path.dirname(this.dbPath));
    
    this.db = new sqlite3.Database(this.dbPath);
    await this.createTables();
    console.log('💾 SCRI Core Memory Database initialized');
  }

  createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Conversations table
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

        // Projects table
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

        // AI learning patterns table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            pattern_type TEXT NOT NULL,
            pattern_data TEXT NOT NULL,
            success_rate REAL DEFAULT 0.0,
            usage_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);

        // Platform sessions table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            project_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration INTEGER,
            conversation_count INTEGER DEFAULT 0
          )
        `);

        // Create indexes for better performance
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_project ON patterns(project_id)`);

        resolve();
      });
    });
  }

  // Conversation methods
  addConversation(conversation) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, platform, project_id, message, context, timestamp, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        conversation.id,
        conversation.platform,
        conversation.projectId,
        conversation.message,
        JSON.stringify(conversation.context),
        conversation.timestamp,
        conversation.type
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });

      stmt.finalize();
    });
  }

  getConversationsByProject(projectId, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM conversations 
         WHERE project_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [projectId, limit],
        (err, rows) => {
          if (err) reject(err);
          else {
            const conversations = rows.map(row => ({
              ...row,
              context: JSON.parse(row.context || '{}')
            }));
            resolve(conversations);
          }
        }
      );
    });
  }

  getConversationsByPlatform(platform, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM conversations 
         WHERE platform = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [platform, limit],
        (err, rows) => {
          if (err) reject(err);
          else {
            const conversations = rows.map(row => ({
              ...row,
              context: JSON.parse(row.context || '{}')
            }));
            resolve(conversations);
          }
        }
      );
    });
  }

  getConversationCount() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM conversations',
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  // Project methods
  addProject(project) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO projects 
        (id, name, path, type, framework, last_modified, ai_enabled, config)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        project.id,
        project.name,
        project.path,
        project.type,
        project.framework,
        project.lastModified,
        project.aiEnabled ? 1 : 0,
        JSON.stringify(project.config)
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });

      stmt.finalize();
    });
  }

  getProject(projectId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM projects WHERE id = ?',
        [projectId],
        (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              ...row,
              aiEnabled: row.ai_enabled === 1,
              config: JSON.parse(row.config || '{}')
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  getAllProjects() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM projects ORDER BY last_modified DESC',
        (err, rows) => {
          if (err) reject(err);
          else {
            const projects = rows.map(row => ({
              ...row,
              aiEnabled: row.ai_enabled === 1,
              config: JSON.parse(row.config || '{}')
            }));
            resolve(projects);
          }
        }
      );
    });
  }

  // Pattern learning methods
  addPattern(projectId, patternType, patternData, successRate = 0.0) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO patterns (project_id, pattern_type, pattern_data, success_rate, usage_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `);

      stmt.run([
        projectId,
        patternType,
        JSON.stringify(patternData),
        successRate,
        now,
        now
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });

      stmt.finalize();
    });
  }

  getPatterns(projectId, patternType = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM patterns WHERE project_id = ?';
      let params = [projectId];

      if (patternType) {
        query += ' AND pattern_type = ?';
        params.push(patternType);
      }

      query += ' ORDER BY success_rate DESC, usage_count DESC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          const patterns = rows.map(row => ({
            ...row,
            pattern_data: JSON.parse(row.pattern_data)
          }));
          resolve(patterns);
        }
      });
    });
  }

  updatePatternUsage(patternId, successful = true) {
    return new Promise((resolve, reject) => {
      // First get current stats
      this.db.get(
        'SELECT usage_count, success_rate FROM patterns WHERE id = ?',
        [patternId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            reject(new Error('Pattern not found'));
            return;
          }

          const newUsageCount = row.usage_count + 1;
          const currentSuccesses = Math.round(row.success_rate * row.usage_count);
          const newSuccesses = successful ? currentSuccesses + 1 : currentSuccesses;
          const newSuccessRate = newSuccesses / newUsageCount;

          // Update the pattern
          this.db.run(
            `UPDATE patterns 
             SET usage_count = ?, success_rate = ?, updated_at = ?
             WHERE id = ?`,
            [newUsageCount, newSuccessRate, new Date().toISOString(), patternId],
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        }
      );
    });
  }

  // Session tracking methods
  startSession(sessionId, platform, projectId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (id, platform, project_id, started_at)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run([
        sessionId,
        platform,
        projectId,
        new Date().toISOString()
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });

      stmt.finalize();
    });
  }

  endSession(sessionId, conversationCount = 0) {
    return new Promise((resolve, reject) => {
      const endTime = new Date().toISOString();
      
      // Get start time to calculate duration
      this.db.get(
        'SELECT started_at FROM sessions WHERE id = ?',
        [sessionId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            reject(new Error('Session not found'));
            return;
          }

          const startTime = new Date(row.started_at);
          const duration = new Date(endTime) - startTime;

          this.db.run(
            `UPDATE sessions 
             SET ended_at = ?, duration = ?, conversation_count = ?
             WHERE id = ?`,
            [endTime, duration, conversationCount, sessionId],
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        }
      );
    });
  }

  // Analytics methods
  getProjectStats(projectId) {
    return new Promise((resolve, reject) => {
      const stats = {};
      
      // Get conversation count
      this.db.get(
        'SELECT COUNT(*) as count FROM conversations WHERE project_id = ?',
        [projectId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          stats.conversationCount = row.count;
          
          // Get platform distribution
          this.db.all(
            `SELECT platform, COUNT(*) as count 
             FROM conversations 
             WHERE project_id = ? 
             GROUP BY platform`,
            [projectId],
            (err, rows) => {
              if (err) {
                reject(err);
                return;
              }
              
              stats.platformDistribution = rows;
              
              // Get recent activity
              this.db.get(
                `SELECT MAX(timestamp) as last_activity 
                 FROM conversations 
                 WHERE project_id = ?`,
                [projectId],
                (err, row) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  
                  stats.lastActivity = row.last_activity;
                  resolve(stats);
                }
              );
            }
          );
        }
      );
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = MemoryDatabase;