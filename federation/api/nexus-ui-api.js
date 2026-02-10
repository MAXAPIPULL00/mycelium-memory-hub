// Federation Hub v2 - Nexus UI API
// Tasks 30-35: Nexus UI Integration Implementation
// Requirements: 21-26

const express = require('express');
const { v4: uuidv4 } = require('uuid');

class NexusUIAPI {
  constructor(federationHub) {
    this.hub = federationHub;
    this.router = express.Router();
    this.setupRoutes();
  }

  getRouter() {
    return this.router;
  }

  setupRoutes() {
    // === DASHBOARD API (Requirement 21) ===
    
    // GET /api/federation/status (Requirement 21.1)
    this.router.get('/status', async (req, res) => {
      try {
        const status = await this.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/health (Requirement 21.2)
    this.router.get('/health', async (req, res) => {
      try {
        const health = {
          status: 'healthy',
          uptime_ms: Math.round(process.uptime() * 1000),
          timestamp: new Date().toISOString()
        };
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/hub/health (Requirement 21.3)
    this.router.get('/hub/health', async (req, res) => {
      try {
        const healthAggregator = this.hub.healthAggregator;
        if (healthAggregator) {
          const health = await healthAggregator.getFederationHealth();
          res.json({
            status: health.federation.status,
            nodes_online: health.federation.nodes_online,
            timestamp: new Date().toISOString()
          });
        } else {
          res.json({ status: 'unknown', nodes_online: 0 });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/external-entities (Requirement 21.4)
    this.router.get('/external-entities', async (req, res) => {
      try {
        const entityRegistry = this.hub.entityRegistry;
        const entities = entityRegistry ? entityRegistry.getEntities() : [];
        
        const external = entities.map(e => ({
          entity_id: e.entity_id,
          description: e.name || e.entity_id,
          last_seen: e.last_seen
        }));
        
        res.json(external);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === MESSAGING API (Requirement 22) ===

    // POST /api/federation/send (Requirement 22.1)
    this.router.post('/send', async (req, res) => {
      try {
        const { to, message, from_agent, metadata, message_type } = req.body;
        
        if (!to || !message) {
          return res.status(400).json({ error: 'to and message are required' });
        }
        
        // Check access control
        if (this.hub.accessControl && !this.hub.accessControl.isAllowed(from_agent)) {
          return res.status(403).json({ error: 'Sender is blocked' });
        }
        
        const messageId = uuidv4();
        const federationMessage = {
          id: messageId,
          type: message_type || 'message',
          from_node: from_agent || 'nexus-ui',
          to_node: to,
          content: message,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        };
        
        // Send via WebSocket pool
        if (this.hub.webSocketPool) {
          await this.hub.webSocketPool.sendToNode(to, federationMessage);
        }
        
        // Also emit via event bus
        if (this.hub.eventBus) {
          await this.hub.eventBus.emit({
            event_type: 'federation.message.sent',
            source_node: from_agent,
            data: { to, message_type }
          });
        }
        
        res.json({
          success: true,
          message_id: messageId
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/ping/:entity (Requirement 22.2)
    this.router.get('/ping/:entity', async (req, res) => {
      try {
        const { entity } = req.params;
        const startTime = Date.now();
        
        const entityRegistry = this.hub.entityRegistry;
        const entityData = entityRegistry ? entityRegistry.getEntity(entity) : null;
        
        const latency = Date.now() - startTime;
        
        res.json({
          success: entityData !== null,
          latency_ms: latency,
          entity_status: entityData?.status || 'unknown'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === ACCESS CONTROL API (Requirement 23) ===

    // GET /api/federation/access/blocked (Requirement 23.1)
    this.router.get('/access/blocked', async (req, res) => {
      try {
        const accessControl = this.hub.accessControl;
        if (accessControl) {
          const result = await accessControl.getBlockedEntities();
          res.json(result);
        } else {
          res.json({ blocked: [], count: 0 });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/access/block/:entity_id (Requirement 23.2)
    this.router.post('/access/block/:entity_id', async (req, res) => {
      try {
        const { entity_id } = req.params;
        const accessControl = this.hub.accessControl;
        
        if (accessControl) {
          const result = await accessControl.blockEntity(entity_id);
          res.json(result);
        } else {
          res.status(503).json({ error: 'Access control not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/access/unblock/:entity_id (Requirement 23.3)
    this.router.post('/access/unblock/:entity_id', async (req, res) => {
      try {
        const { entity_id } = req.params;
        const accessControl = this.hub.accessControl;
        
        if (accessControl) {
          const result = await accessControl.unblockEntity(entity_id);
          res.json(result);
        } else {
          res.status(503).json({ error: 'Access control not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/access/allowed (Requirement 23.4)
    this.router.get('/access/allowed', async (req, res) => {
      try {
        const accessControl = this.hub.accessControl;
        if (accessControl) {
          const result = await accessControl.getAllowedEntities();
          res.json(result);
        } else {
          res.json({ allowed: [], count: 0 });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/access/allow/:entity_id (Requirement 23.5)
    this.router.post('/access/allow/:entity_id', async (req, res) => {
      try {
        const { entity_id } = req.params;
        const accessControl = this.hub.accessControl;
        
        if (accessControl) {
          const result = await accessControl.allowEntity(entity_id);
          res.json(result);
        } else {
          res.status(503).json({ error: 'Access control not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/access/remove-allow/:entity_id (Requirement 23.6)
    this.router.post('/access/remove-allow/:entity_id', async (req, res) => {
      try {
        const { entity_id } = req.params;
        const accessControl = this.hub.accessControl;
        
        if (accessControl) {
          const result = await accessControl.removeAllowedEntity(entity_id);
          res.json(result);
        } else {
          res.status(503).json({ error: 'Access control not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/access/reset (Requirement 23.7)
    this.router.post('/access/reset', async (req, res) => {
      try {
        const accessControl = this.hub.accessControl;
        
        if (accessControl) {
          const result = await accessControl.resetAccessControl();
          res.json(result);
        } else {
          res.status(503).json({ error: 'Access control not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === MEMORY API (Requirement 24) ===

    // POST /api/federation/memory/store (Requirement 24.1)
    this.router.post('/memory/store', async (req, res) => {
      try {
        const { content, type, tags, source } = req.body;
        
        if (!content) {
          return res.status(400).json({ error: 'content is required' });
        }
        
        // Store via memory hub
        const memoryHub = this.hub.memoryHub;
        const memoryId = uuidv4();
        
        await memoryHub.addConversation({
          id: memoryId,
          platform: source || 'nexus-ui',
          projectId: 'federation',
          type: type || 'memory',
          message: content,
          context: { tags: tags || [], source },
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          memory_id: memoryId
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/memory/search (Requirement 24.2)
    this.router.get('/memory/search', async (req, res) => {
      try {
        const { query, limit = 10 } = req.query;
        
        if (!query) {
          return res.status(400).json({ error: 'query is required' });
        }
        
        // Search via memory hub
        const memoryHub = this.hub.memoryHub;
        const results = await memoryHub.db.searchConversations(query, parseInt(limit));
        
        res.json(results || []);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === OGMA API (Requirement 25) ===

    // POST /api/federation/ogma/answer (Requirement 25.1)
    this.router.post('/ogma/answer', async (req, res) => {
      try {
        const { question_id, answer, from_agent } = req.body;
        
        // Send to Ogma via event bus
        if (this.hub.eventBus) {
          await this.hub.eventBus.broadcast(from_agent || 'nexus-ui', 'ogma.answer', {
            question_id,
            answer
          }, 'ogma');
        }
        
        res.json({ success: true, acknowledged: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/ogma/build-update (Requirement 25.2)
    this.router.post('/ogma/build-update', async (req, res) => {
      try {
        const { spec_id, status, progress_percent, message } = req.body;
        
        if (this.hub.eventBus) {
          await this.hub.eventBus.broadcast('nexus-ui', 'ogma.build-update', {
            spec_id,
            status,
            progress_percent,
            message
          }, 'ogma');
        }
        
        res.json({ success: true, acknowledged: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/ogma/spec-clarify (Requirement 25.3)
    this.router.post('/ogma/spec-clarify', async (req, res) => {
      try {
        const { spec_id, clarification, from_agent } = req.body;
        
        if (this.hub.eventBus) {
          await this.hub.eventBus.broadcast(from_agent || 'nexus-ui', 'ogma.spec-clarify', {
            spec_id,
            clarification
          }, 'ogma');
        }
        
        res.json({ success: true, acknowledged: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === EVENTS API (Requirement 26) ===

    // GET /api/federation/events/joins (Requirement 26.1)
    this.router.get('/events/joins', async (req, res) => {
      try {
        const { limit = 20 } = req.query;
        
        const entityRegistry = this.hub.entityRegistry;
        if (entityRegistry) {
          const events = await entityRegistry.getJoinEvents(parseInt(limit));
          res.json(events);
        } else {
          res.json([]);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/entities (Requirement 26.2)
    this.router.get('/entities', async (req, res) => {
      try {
        const entityRegistry = this.hub.entityRegistry;
        if (entityRegistry) {
          const entities = entityRegistry.getEntitiesInAthenaFormat();
          res.json(entities);
        } else {
          res.json([]);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === NODE REGISTRY API ===

    // GET /api/federation/nodes
    this.router.get('/nodes', async (req, res) => {
      try {
        const nodeRegistry = this.hub.nodeRegistry;
        if (nodeRegistry) {
          const nodes = await nodeRegistry.listNodes(req.query);
          res.json(nodes);
        } else {
          res.json([]);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/federation/nodes/:nodeId
    this.router.get('/nodes/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const nodeRegistry = this.hub.nodeRegistry;
        
        if (nodeRegistry) {
          const node = await nodeRegistry.getNode(nodeId);
          if (node) {
            res.json(node);
          } else {
            res.status(404).json({ error: 'Node not found' });
          }
        } else {
          res.status(503).json({ error: 'Node registry not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/federation/nodes/register
    this.router.post('/nodes/register', async (req, res) => {
      try {
        const nodeRegistry = this.hub.nodeRegistry;
        
        if (nodeRegistry) {
          const result = await nodeRegistry.registerNode(req.body);
          res.json(result);
        } else {
          res.status(503).json({ error: 'Node registry not available' });
        }
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });
  }

  // Get federation status (Requirement 21.1)
  async getStatus() {
    const nodeRegistry = this.hub.nodeRegistry;
    const entityRegistry = this.hub.entityRegistry;
    const webSocketPool = this.hub.webSocketPool;
    
    const nodeStats = nodeRegistry ? await nodeRegistry.getStats() : { total: 0, online: 0 };
    const entityStats = entityRegistry ? await entityRegistry.getStats() : { total: 0, online: 0 };
    
    return {
      bridge: {
        status: 'connected',
        local_mycelium: 'http://192.168.0.69:8765',
        external_hub: 'https://scri-core-memory.fly.dev'
      },
      stats: {
        bridged_out: 0,
        bridged_in: 0,
        last_poll: new Date().toISOString()
      },
      local_entities: ['aria', 'librarian', 'akasha', 'aratta', 'athena'],
      external_entities: entityRegistry ? entityRegistry.getEntities().map(e => ({
        entity_id: e.entity_id,
        description: e.name
      })) : [],
      nodes: nodeStats,
      entities: entityStats,
      websocket_connections: webSocketPool ? webSocketPool.getConnectionCount() : 0,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = NexusUIAPI;
