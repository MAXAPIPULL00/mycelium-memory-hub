// Federation Hub v2 - Database Schema
// Task 1: Database Schema Migration

const { v4: uuidv4 } = require('uuid');

class FederationSchema {
  constructor(database) {
    this.db = database.db;
    this.isProduction = database.isProduction;
  }

  async createFederationTables() {
    console.log('🗄️ Creating Federation Hub v2 database tables...');
    
    try {
      if (this.isProduction) {
        await this.createPostgreSQLTables();
      } else {
        await this.createSQLiteTables();
      }
      
      await this.createIndexes();
      console.log('✅ Federation Hub v2 tables created successfully');
    } catch (error) {
      console.error('❌ Error creating Federation tables:', error);
      throw error;
    }
  }

  async createPostgreSQLTables() {
    const queries = [
      // Federation Nodes (Requirement 2)
      `CREATE TABLE IF NOT EXISTS federation_nodes (
        id VARCHAR(100) PRIMARY KEY,
        display_name TEXT NOT NULL,
        owner VARCHAR(50) NOT NULL,
        network JSONB NOT NULL,
        services JSONB DEFAULT '{}',
        capabilities JSONB DEFAULT '[]',
        hardware JSONB DEFAULT '{}',
        sovereignty JSONB DEFAULT '{}',
        public_key TEXT,
        msh_attestation JSONB,
        status VARCHAR(20) DEFAULT 'offline',
        last_heartbeat TIMESTAMP,
        registered_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Node Health History (Requirement 3)
      `CREATE TABLE IF NOT EXISTS federation_health_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id VARCHAR(100) REFERENCES federation_nodes(id) ON DELETE CASCADE,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        services_status JSONB,
        resources JSONB,
        inference_metrics JSONB
      )`,

      // Model Registry (Requirement 5)
      `CREATE TABLE IF NOT EXISTS federation_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id VARCHAR(200) NOT NULL,
        node_id VARCHAR(100) REFERENCES federation_nodes(id) ON DELETE CASCADE,
        display_name TEXT,
        type VARCHAR(50),
        quantization VARCHAR(20),
        size_gb DECIMAL,
        context_length INT,
        capabilities JSONB DEFAULT '[]',
        inference_port INT,
        performance_metrics JSONB,
        status VARCHAR(20) DEFAULT 'available',
        queue_depth INT DEFAULT 0,
        loaded_at TIMESTAMP,
        UNIQUE(model_id, node_id)
      )`,

      // Task Queue (Requirement 6)
      `CREATE TABLE IF NOT EXISTS federation_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal',
        requirements JSONB,
        routing VARCHAR(50),
        payload JSONB NOT NULL,
        callback JSONB,
        status VARCHAR(20) DEFAULT 'queued',
        assigned_node VARCHAR(100) REFERENCES federation_nodes(id),
        result JSONB,
        metrics JSONB,
        error_message TEXT,
        submitted_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      )`,

      // Event Subscriptions (Requirement 7)
      `CREATE TABLE IF NOT EXISTS federation_event_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscriber VARCHAR(100) NOT NULL,
        events JSONB NOT NULL,
        filter JSONB DEFAULT '{}',
        channel VARCHAR(20) NOT NULL,
        webhook_url TEXT,
        webhook_secret TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // Knowledge Sync Records (Requirement 8)
      `CREATE TABLE IF NOT EXISTS federation_knowledge_syncs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_node VARCHAR(100) NOT NULL,
        to_node VARCHAR(100) NOT NULL,
        request JSONB NOT NULL,
        sync_mode VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        progress JSONB,
        result JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        approved_at TIMESTAMP,
        completed_at TIMESTAMP
      )`,

      // Auth Tokens (Requirement 9)
      `CREATE TABLE IF NOT EXISTS federation_auth_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id VARCHAR(100) REFERENCES federation_nodes(id) ON DELETE CASCADE,
        name VARCHAR(100),
        token_hash VARCHAR(64) NOT NULL,
        permissions JSONB NOT NULL,
        rate_limit INT,
        expires_at TIMESTAMP,
        revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      )`,

      // Secrets Vault (Requirement 10)
      `CREATE TABLE IF NOT EXISTS federation_vault (
        key VARCHAR(200) PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        owner VARCHAR(50) NOT NULL,
        authorized_nodes JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Message persistence with TTL (Requirement 11)
      `CREATE TABLE IF NOT EXISTS federation_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_node VARCHAR(100) NOT NULL,
        to_node VARCHAR(100),
        channel VARCHAR(100),
        content JSONB NOT NULL,
        ephemeral BOOLEAN DEFAULT false,
        ttl_seconds INT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        read_at TIMESTAMP
      )`,

      // File transfers (Requirement 12)
      `CREATE TABLE IF NOT EXISTS federation_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes BIGINT NOT NULL,
        storage_path TEXT NOT NULL,
        recipient VARCHAR(100),
        metadata JSONB DEFAULT '{}',
        ephemeral BOOLEAN DEFAULT false,
        expires_at TIMESTAMP,
        uploaded_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // Audit logs (Requirement 14)
      `CREATE TABLE IF NOT EXISTS federation_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP DEFAULT NOW(),
        node_id VARCHAR(100),
        action_type VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        outcome VARCHAR(20) NOT NULL,
        details JSONB DEFAULT '{}',
        ip_address INET
      )`,

      // Offline message queue (Requirement 15)
      `CREATE TABLE IF NOT EXISTS federation_pending_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_node VARCHAR(100) NOT NULL,
        message JSONB NOT NULL,
        queued_at TIMESTAMP DEFAULT NOW(),
        attempts INT DEFAULT 0,
        expires_at TIMESTAMP
      )`,

      // Federation governance (Requirement 16)
      `CREATE TABLE IF NOT EXISTS federation_join_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id VARCHAR(100) NOT NULL,
        owner VARCHAR(50) NOT NULL,
        requested_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS federation_invites (
        token VARCHAR(64) PRIMARY KEY,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        used_by VARCHAR(100),
        used_at TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS federation_banned_nodes (
        node_id VARCHAR(100) PRIMARY KEY,
        banned_by VARCHAR(100) NOT NULL,
        banned_at TIMESTAMP DEFAULT NOW(),
        reason TEXT
      )`,

      // P2P connectivity cache (Requirement 19)
      `CREATE TABLE IF NOT EXISTS federation_p2p_connectivity (
        source_node VARCHAR(100) NOT NULL,
        target_node VARCHAR(100) NOT NULL,
        direct_endpoint TEXT,
        last_probe TIMESTAMP,
        latency_ms INT,
        reachable BOOLEAN DEFAULT false,
        PRIMARY KEY (source_node, target_node)
      )`,

      // Entity registration persistence (Requirement 28)
      `CREATE TABLE IF NOT EXISTS federation_registered_entities (
        entity_id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        capabilities JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        registered_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      )`,

      // Access control lists (Requirement 23)
      `CREATE TABLE IF NOT EXISTS federation_access_blocklist (
        entity_id VARCHAR(100) PRIMARY KEY,
        blocked_by VARCHAR(100) NOT NULL,
        blocked_at TIMESTAMP DEFAULT NOW(),
        reason TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS federation_access_allowlist (
        entity_id VARCHAR(100) PRIMARY KEY,
        allowed_by VARCHAR(100) NOT NULL,
        allowed_at TIMESTAMP DEFAULT NOW()
      )`,

      // Join events for Nexus UI (Requirement 26)
      `CREATE TABLE IF NOT EXISTS federation_join_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id VARCHAR(100) NOT NULL,
        entity_name VARCHAR(200),
        entity_type VARCHAR(50),
        capabilities JSONB DEFAULT '[]',
        joined_at TIMESTAMP DEFAULT NOW()
      )`
    ];

    for (const query of queries) {
      await this.db.query(query);
    }
  }

  async createSQLiteTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Federation Nodes
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_nodes (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            owner TEXT NOT NULL,
            network TEXT NOT NULL,
            services TEXT DEFAULT '{}',
            capabilities TEXT DEFAULT '[]',
            hardware TEXT DEFAULT '{}',
            sovereignty TEXT DEFAULT '{}',
            public_key TEXT,
            msh_attestation TEXT,
            status TEXT DEFAULT 'offline',
            last_heartbeat TEXT,
            registered_at TEXT,
            updated_at TEXT
          )
        `);

        // Node Health History
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_health_history (
            id TEXT PRIMARY KEY,
            node_id TEXT,
            timestamp TEXT,
            services_status TEXT,
            resources TEXT,
            inference_metrics TEXT
          )
        `);

        // Model Registry
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_models (
            id TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            node_id TEXT,
            display_name TEXT,
            type TEXT,
            quantization TEXT,
            size_gb REAL,
            context_length INTEGER,
            capabilities TEXT DEFAULT '[]',
            inference_port INTEGER,
            performance_metrics TEXT,
            status TEXT DEFAULT 'available',
            queue_depth INTEGER DEFAULT 0,
            loaded_at TEXT,
            UNIQUE(model_id, node_id)
          )
        `);

        // Task Queue
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_tasks (
            id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            requirements TEXT,
            routing TEXT,
            payload TEXT NOT NULL,
            callback TEXT,
            status TEXT DEFAULT 'queued',
            assigned_node TEXT,
            result TEXT,
            metrics TEXT,
            error_message TEXT,
            submitted_by TEXT,
            created_at TEXT,
            started_at TEXT,
            completed_at TEXT
          )
        `);

        // Event Subscriptions
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_event_subscriptions (
            id TEXT PRIMARY KEY,
            subscriber TEXT NOT NULL,
            events TEXT NOT NULL,
            filter TEXT DEFAULT '{}',
            channel TEXT NOT NULL,
            webhook_url TEXT,
            webhook_secret TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT
          )
        `);

        // Knowledge Sync Records
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_knowledge_syncs (
            id TEXT PRIMARY KEY,
            from_node TEXT NOT NULL,
            to_node TEXT NOT NULL,
            request TEXT NOT NULL,
            sync_mode TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            progress TEXT,
            result TEXT,
            created_at TEXT,
            approved_at TEXT,
            completed_at TEXT
          )
        `);

        // Auth Tokens
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_auth_tokens (
            id TEXT PRIMARY KEY,
            node_id TEXT,
            name TEXT,
            token_hash TEXT NOT NULL,
            permissions TEXT NOT NULL,
            rate_limit INTEGER,
            expires_at TEXT,
            revoked INTEGER DEFAULT 0,
            created_at TEXT,
            last_used_at TEXT
          )
        `);

        // Secrets Vault
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_vault (
            key TEXT PRIMARY KEY,
            encrypted_value TEXT NOT NULL,
            owner TEXT NOT NULL,
            authorized_nodes TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            created_at TEXT,
            updated_at TEXT
          )
        `);

        // Message persistence
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_messages (
            id TEXT PRIMARY KEY,
            from_node TEXT NOT NULL,
            to_node TEXT,
            channel TEXT,
            content TEXT NOT NULL,
            ephemeral INTEGER DEFAULT 0,
            ttl_seconds INTEGER,
            expires_at TEXT,
            created_at TEXT,
            read_at TEXT
          )
        `);

        // File transfers
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_files (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            recipient TEXT,
            metadata TEXT DEFAULT '{}',
            ephemeral INTEGER DEFAULT 0,
            expires_at TEXT,
            uploaded_by TEXT NOT NULL,
            created_at TEXT
          )
        `);

        // Audit logs
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_audit_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            node_id TEXT,
            action_type TEXT NOT NULL,
            action TEXT NOT NULL,
            outcome TEXT NOT NULL,
            details TEXT DEFAULT '{}',
            ip_address TEXT
          )
        `);

        // Offline message queue
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_pending_messages (
            id TEXT PRIMARY KEY,
            target_node TEXT NOT NULL,
            message TEXT NOT NULL,
            queued_at TEXT,
            attempts INTEGER DEFAULT 0,
            expires_at TEXT
          )
        `);

        // Federation governance
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_join_requests (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            owner TEXT NOT NULL,
            requested_at TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at TEXT,
            rejection_reason TEXT
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_invites (
            token TEXT PRIMARY KEY,
            created_by TEXT NOT NULL,
            created_at TEXT,
            expires_at TEXT NOT NULL,
            used_by TEXT,
            used_at TEXT
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_banned_nodes (
            node_id TEXT PRIMARY KEY,
            banned_by TEXT NOT NULL,
            banned_at TEXT,
            reason TEXT
          )
        `);

        // P2P connectivity cache
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_p2p_connectivity (
            source_node TEXT NOT NULL,
            target_node TEXT NOT NULL,
            direct_endpoint TEXT,
            last_probe TEXT,
            latency_ms INTEGER,
            reachable INTEGER DEFAULT 0,
            PRIMARY KEY (source_node, target_node)
          )
        `);

        // Entity registration persistence
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_registered_entities (
            entity_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            capabilities TEXT DEFAULT '[]',
            metadata TEXT DEFAULT '{}',
            registered_at TEXT,
            last_seen TEXT
          )
        `);

        // Access control lists
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_access_blocklist (
            entity_id TEXT PRIMARY KEY,
            blocked_by TEXT NOT NULL,
            blocked_at TEXT,
            reason TEXT
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_access_allowlist (
            entity_id TEXT PRIMARY KEY,
            allowed_by TEXT NOT NULL,
            allowed_at TEXT
          )
        `);

        // Join events
        this.db.run(`
          CREATE TABLE IF NOT EXISTS federation_join_events (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL,
            entity_name TEXT,
            entity_type TEXT,
            capabilities TEXT DEFAULT '[]',
            joined_at TEXT
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
      'CREATE INDEX IF NOT EXISTS idx_fed_nodes_owner ON federation_nodes(owner)',
      'CREATE INDEX IF NOT EXISTS idx_fed_nodes_status ON federation_nodes(status)',
      'CREATE INDEX IF NOT EXISTS idx_fed_health_node_time ON federation_health_history(node_id, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_fed_models_node ON federation_models(node_id)',
      'CREATE INDEX IF NOT EXISTS idx_fed_tasks_status ON federation_tasks(status)',
      'CREATE INDEX IF NOT EXISTS idx_fed_tasks_assigned ON federation_tasks(assigned_node)',
      'CREATE INDEX IF NOT EXISTS idx_fed_tasks_priority ON federation_tasks(priority, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_fed_messages_expires ON federation_messages(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_fed_messages_to_node ON federation_messages(to_node)',
      'CREATE INDEX IF NOT EXISTS idx_fed_audit_timestamp ON federation_audit_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_fed_audit_node ON federation_audit_logs(node_id)',
      'CREATE INDEX IF NOT EXISTS idx_fed_pending_target ON federation_pending_messages(target_node)',
      'CREATE INDEX IF NOT EXISTS idx_fed_entities_type ON federation_registered_entities(type)',
      'CREATE INDEX IF NOT EXISTS idx_fed_join_events_time ON federation_join_events(joined_at)'
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
}

module.exports = FederationSchema;
