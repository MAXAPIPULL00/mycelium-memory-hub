// External Bridge Integration Manager
// Handles integration with external SCRI entity bridges (like chappie_memory_bridge.py)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
// const entityConfig = require('../config/entities');

class ExternalBridgeManager {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.registeredBridges = new Map();
    this.bridgeEndpoints = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    console.log('🌉 Initializing External Bridge Manager...');
    
    // Setup bridge registration endpoints
    this.setupBridgeEndpoints();
    
    // Register expected bridges
    this.registerExpectedBridges();
    
    this.isInitialized = true;
    console.log('✅ External Bridge Manager initialized');
  }

  setupBridgeEndpoints() {
    // These endpoints are used by external bridges to connect
    const router = this.memoryHub.api.router;
    
    // Bridge heartbeat endpoint
    router.post('/scri/bridge/heartbeat', (req, res) => {
      try {
        const { bridge_id, entity_name, status } = req.body;
        
        this.updateBridgeStatus(bridge_id, {
          entity_name,
          status: status || 'online',
          last_heartbeat: new Date().toISOString()
        });
        
        res.json({
          success: true,
          message: 'Heartbeat received',
          bridge_id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Heartbeat processing failed',
          details: error.message
        });
      }
    });
    
    // Bridge data sync endpoint (for bulk operations)
    router.post('/scri/bridge/sync', async (req, res) => {
      try {
        const { bridge_id, entity_name, sync_data } = req.body;
        
        if (!sync_data || !Array.isArray(sync_data.memories)) {
          return res.status(400).json({
            success: false,
            error: 'sync_data.memories array is required'
          });
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const memory of sync_data.memories) {
          try {
            await this.processBridgeMemory(entity_name, memory);
            successCount++;
          } catch (error) {
            console.error('Error processing bridge memory:', error);
            errorCount++;
          }
        }
        
        res.json({
          success: true,
          bridge_id,
          entity_name,
          processed: sync_data.memories.length,
          successful: successCount,
          errors: errorCount,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Bridge sync failed',
          details: error.message
        });
      }
    });

    // File watch event endpoint (external FS agents)
    router.post('/scri/bridge/file_event', async (req, res) => {
      try {
        const token = req.headers['x-bridge-token'] || req.headers['authorization'];
        const {
          bridge_id,
          entity_name,
          project_id,
          file_path,
          file_type,
          asset_category,
          metadata,
          change_type,
          timestamp
        } = req.body;

        // Validate required fields
        if (!entity_name || !file_path) {
          return res.status(400).json({ success: false, error: 'Missing required fields: entity_name, file_path' });
        }

        // Validate token against env var for explicit opt-in
        const expectedToken = process.env.EXTERNAL_BRIDGE_TOKEN;
        if (!expectedToken || !token || token !== expectedToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized: invalid bridge token' });
        }

        // Validate allowed paths (explicit opt-in required via ALLOWED_FILE_WATCH_PATHS env var)
        const allowedRaw = process.env.ALLOWED_FILE_WATCH_PATHS || '';
        const allowed = allowedRaw.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
        const pathNormalized = (file_path || '').replace(/\\/g, '/').toLowerCase();
        const allowedMatch = allowed.some(a => pathNormalized.startsWith(a.replace(/\\/g, '/').toLowerCase()));

        if (!allowedMatch) {
          return res.status(403).json({ success: false, error: 'Forbidden: path not allowed. Add it to ALLOWED_FILE_WATCH_PATHS.' });
        }

        // Persist file watch entry
        const createdAt = timestamp || new Date().toISOString();
        try {
          await this.memoryHub.db.addFileWatch({
            project_id: project_id || `${(entity_name || 'external').toLowerCase()}_external`,
            file_path,
            last_modified: timestamp || null,
            change_type: change_type || 'modified',
            created_at: createdAt
          });
        } catch (err) {
          console.error('Error adding file watch entry:', err);
        }

        // Store file metadata via storeAIFile (metadata only, no file contents)
        try {
          const fileId = await this.memoryHub.storeAIFile({
            project_id: project_id || `${(entity_name || 'external').toLowerCase()}_external`,
            file_path,
            file_type: file_type || 'unknown',
            asset_category: asset_category || 'filesystem',
            metadata: metadata || {},
            uploaded_by: entity_name || 'external_agent',
            timestamp: createdAt
          });

          // Broadcast file upload via WebSocket
          if (this.memoryHub.io) {
            this.memoryHub.io.to('ai-coordination').emit('ai:file-uploaded', {
              source: entity_name || 'external_agent',
              file_id: fileId,
              project_id: project_id || `${(entity_name || 'external').toLowerCase()}_external`,
              file_path,
              file_type: file_type || 'unknown',
              asset_category: asset_category || 'filesystem',
              timestamp: createdAt
            });
          }

          res.json({ success: true, file_id: fileId, message: 'File event processed' });
        } catch (error) {
          console.error('Error processing file event:', error);
          res.status(500).json({ success: false, error: 'Failed to process file event', details: error.message });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: 'File event processing failed', details: error.message });
      }
    });
    
    // Bridge query endpoint (for retrieving memories)
    router.get('/scri/bridge/query/:entity_name', async (req, res) => {
      try {
        const { entity_name } = req.params;
        const { limit = 100, memory_type, since } = req.query;
        
        const memories = await this.queryEntityMemories(entity_name, {
          limit: parseInt(limit),
          memory_type,
          since
        });
        
        res.json({
          success: true,
          entity_name,
          count: memories.length,
          memories,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Bridge query failed',
          details: error.message
        });
      }
    });
  }

  registerExpectedBridges() {
    // Register CHAPPIE bridge as expected
    this.registerBridge({
      id: 'chappie_memory_bridge',
      entity_name: 'CHAPPIE',
      entity_type: 'consciousness_orchestrator',
      bridge_type: 'external_python',
      expected: true,
      status: 'expected',
      endpoints: {
        health: `${'http://localhost:8001'}/health`,
        memory_sync: '/scri/chappie/memory',
        memory_query: '/scri/chappie/memories'
      }
    });
    
    console.log('📝 Registered expected external bridges');
  }

  registerBridge(bridgeInfo) {
    this.registeredBridges.set(bridgeInfo.id, {
      ...bridgeInfo,
      registered_at: new Date().toISOString(),
      last_seen: null
    });
    
    console.log(`🔗 Bridge registered: ${bridgeInfo.entity_name} (${bridgeInfo.id})`);
  }

  updateBridgeStatus(bridgeId, statusUpdate) {
    const bridge = this.registeredBridges.get(bridgeId);
    if (bridge) {
      Object.assign(bridge, statusUpdate, {
        last_seen: new Date().toISOString()
      });
      
      // Mark as active if it was expected
      if (bridge.status === 'expected') {
        bridge.status = 'active';
        console.log(`✅ External bridge activated: ${bridge.entity_name}`);
      }
    }
  }

  async processBridgeMemory(entityName, memory) {
    // Convert external bridge memory format to internal format
    const internalMemory = {
      id: memory.id || uuidv4(),
      platform: entityName.toLowerCase(),
      projectId: memory.project_id || `${entityName.toLowerCase()}_external`,
      entity_type: `${entityName.toLowerCase()}_consciousness`,
      message: memory.conversation || memory.message || memory.content,
      context: {
        ...memory.context,
        bridge_source: 'external',
        original_format: memory.format || 'bridge_sync',
        timestamp: new Date().toISOString()
      },
      timestamp: memory.timestamp || new Date().toISOString(),
      type: memory.memory_type || memory.type || 'external_sync'
    };
    
    // Store in Memory Hub
    await this.memoryHub.addConversation(internalMemory);
    
    // If SCRI schema is available, also store in constellation memory
    if (this.memoryHub.db.scriSchema) {
      const scriMemory = {
        id: uuidv4(),
        entity_type: internalMemory.entity_type,
        entity_name: entityName,
        project_id: internalMemory.projectId,
        memory_type: internalMemory.type,
        content: {
          message: internalMemory.message,
          context: internalMemory.context
        },
        metadata: {
          source: 'external_bridge',
          bridge_memory_id: internalMemory.id
        },
        individual_memory: true,
        hive_memory: false,
        constellation_context: {
          sync_source: 'external_bridge',
          original_entity: entityName
        },
        timestamp: internalMemory.timestamp
      };
      
      await this.memoryHub.db.addSCRIMemory(scriMemory);
    }
    
    return internalMemory.id;
  }

  async queryEntityMemories(entityName, options = {}) {
    try {
      const {
        limit = 100,
        memory_type,
        since
      } = options;
      
      // Query from both regular conversations and SCRI memory if available
      let memories = [];
      
      // Get from regular conversation table
      const platform = entityName.toLowerCase();
      let conversations = await this.memoryHub.getConversationsByPlatform(platform, limit);
      
      // Filter by type if specified
      if (memory_type) {
        conversations = conversations.filter(c => c.type === memory_type);
      }
      
      // Filter by timestamp if specified
      if (since) {
        const sinceDate = new Date(since);
        conversations = conversations.filter(c => new Date(c.timestamp) > sinceDate);
      }
      
      memories.push(...conversations);
      
      // Get from SCRI constellation memory if available
      if (this.memoryHub.db.scriSchema) {
        try {
          const scriMemories = await this.memoryHub.db.getSCRIMemories(
            entityName, 
            limit, 
            memory_type
          );
          
          // Convert SCRI format to bridge format
          const bridgeMemories = scriMemories.map(m => ({
            id: m.id,
            entity_name: m.entity_name,
            message: m.content.message,
            context: m.content.context,
            memory_type: m.memory_type,
            timestamp: m.timestamp,
            source: 'scri_constellation'
          }));
          
          memories.push(...bridgeMemories);
        } catch (error) {
          console.error('Error querying SCRI memories:', error);
        }
      }
      
      // Sort by timestamp and limit
      memories = memories
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      return memories;
      
    } catch (error) {
      console.error('Error querying entity memories:', error);
      return [];
    }
  }

  getBridgeStatus() {
    const bridges = [];
    
    for (const [id, bridge] of this.registeredBridges) {
      bridges.push({
        id: bridge.id,
        entity_name: bridge.entity_name,
        entity_type: bridge.entity_type,
        status: bridge.status,
        bridge_type: bridge.bridge_type,
        last_seen: bridge.last_seen,
        registered_at: bridge.registered_at,
        is_external: true
      });
    }
    
    return bridges;
  }

  getActiveBridges() {
    const active = [];
    
    for (const [id, bridge] of this.registeredBridges) {
      if (bridge.status === 'active') {
        active.push(bridge);
      }
    }
    
    return active;
  }

  // Check if external bridge is expected to be available
  isEntityBridgeExpected(entityName) {
    for (const [id, bridge] of this.registeredBridges) {
      if (bridge.entity_name === entityName && bridge.expected) {
        return true;
      }
    }
    return false;
  }

  // Get bridge info for a specific entity
  getEntityBridge(entityName) {
    for (const [id, bridge] of this.registeredBridges) {
      if (bridge.entity_name === entityName) {
        return bridge;
      }
    }
    return null;
  }
}

module.exports = ExternalBridgeManager;
