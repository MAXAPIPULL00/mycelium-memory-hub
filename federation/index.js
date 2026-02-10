// Federation Hub v2 - Main Entry Point
// Transforms SCRI Memory Hub into a central coordinator for the SCRI-IOS mesh network

// P0 Services
const FederationNodeRegistry = require('./services/node-registry');
const FederationWebSocketPool = require('./services/websocket-pool');
const FederationHealthAggregator = require('./services/health-aggregator');

// P1 Services
const FederationServiceRouter = require('./services/service-router');
const FederationModelRegistry = require('./services/model-registry');
const FederationTaskQueue = require('./services/task-queue');
const FederationEventBus = require('./services/event-bus');

// P2 Services
const FederationKnowledgeSync = require('./services/knowledge-sync');
const FederationIdentityAuth = require('./services/identity-auth');
const FederationSecretsVault = require('./services/secrets-vault');
const FederationMessagePersistence = require('./services/message-persistence');
const FederationFileTransfer = require('./services/file-transfer');
const FederationRateLimiter = require('./services/rate-limiter');
const FederationAuditLogger = require('./services/audit-logger');
const FederationOfflineQueue = require('./services/offline-queue');
const FederationGovernance = require('./services/governance');
const FederationMetrics = require('./services/metrics');
const FederationDegradation = require('./services/degradation');
const FederationP2PFallback = require('./services/p2p-fallback');

// Nexus UI Integration
const FederationEntityRegistry = require('./services/entity-registry');
const FederationAccessControl = require('./services/access-control');
const NexusUIAPI = require('./api/nexus-ui-api');

// Database
const FederationSchema = require('./database/federation-schema');

class FederationHub {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.db = memoryHub.db;
    this.io = memoryHub.io;
    
    // Initialize schema
    this.schema = new FederationSchema(this.db);
    
    // P0: Core services
    this.nodeRegistry = new FederationNodeRegistry(this);
    this.webSocketPool = new FederationWebSocketPool(this);
    this.healthAggregator = new FederationHealthAggregator(this);
    
    // P1: Extended services
    this.serviceRouter = new FederationServiceRouter(this);
    this.modelRegistry = new FederationModelRegistry(this);
    this.taskQueue = new FederationTaskQueue(this);
    this.eventBus = new FederationEventBus(this);
    
    // P2: Advanced services
    this.knowledgeSync = new FederationKnowledgeSync(this);
    this.identityAuth = new FederationIdentityAuth(this);
    this.secretsVault = new FederationSecretsVault(this);
    this.messagePersistence = new FederationMessagePersistence(this);
    this.fileTransfer = new FederationFileTransfer(this);
    this.rateLimiter = new FederationRateLimiter(this);
    this.auditLogger = new FederationAuditLogger(this);
    this.offlineQueue = new FederationOfflineQueue(this);
    this.governance = new FederationGovernance(this);
    this.metrics = new FederationMetrics(this);
    this.degradation = new FederationDegradation(this);
    this.p2pFallback = new FederationP2PFallback(this);
    
    // Nexus UI Integration
    this.entityRegistry = new FederationEntityRegistry(this);
    this.accessControl = new FederationAccessControl(this);
    this.nexusAPI = new NexusUIAPI(this);
    
    // State
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('🌐 Initializing Federation Hub v2...');
    
    try {
      // Create database tables
      await this.schema.createFederationTables();
      
      // Initialize P0 services
      await this.nodeRegistry.initialize();
      await this.webSocketPool.initialize();
      await this.healthAggregator.initialize();
      
      // Initialize P1 services
      await this.eventBus.initialize();
      
      // Initialize P2 services
      await this.knowledgeSync.initialize();
      await this.identityAuth.initialize();
      await this.secretsVault.initialize();
      await this.messagePersistence.initialize();
      await this.fileTransfer.initialize();
      await this.rateLimiter.initialize();
      await this.auditLogger.initialize();
      await this.offlineQueue.initialize();
      await this.governance.initialize();
      await this.metrics.initialize();
      await this.degradation.initialize();
      await this.p2pFallback.initialize();
      
      // Initialize Nexus UI services
      await this.entityRegistry.initialize();
      
      // Mount API routes
      this.memoryHub.app.use('/api/federation', this.nexusAPI.getRouter());
      
      // Mount metrics endpoint
      this.memoryHub.app.get('/metrics', (req, res) => {
        res.set('Content-Type', 'text/plain');
        res.send(this.metrics.toPrometheus());
      });
      
      // Apply rate limiting middleware
      this.memoryHub.app.use('/api/federation', this.rateLimiter.middleware());
      
      // Apply metrics middleware
      this.memoryHub.app.use('/api/federation', this.metrics.requestTimer());
      
      // Setup WebSocket handlers
      this.setupWebSocketHandlers();
      
      this.initialized = true;
      console.log('✅ Federation Hub v2 initialized successfully');
      console.log('   📊 Services: P0 (3) + P1 (4) + P2 (12) + Nexus (3) = 22 total');
      
      // Emit initialization event
      await this.eventBus.emit({
        event_type: 'federation.hub.initialized',
        data: { 
          timestamp: new Date().toISOString(),
          services: this.getServiceList()
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize Federation Hub:', error);
      throw error;
    }
  }

  setupWebSocketHandlers() {
    this.io.on('connection', (socket) => {
      // Track connection in metrics
      this.metrics.incGauge('federation_websocket_connections');
      
      // Log authentication attempt
      this.auditLogger.logAuthentication(
        socket.handshake.query.node_id || 'unknown',
        'success',
        { ip_address: socket.handshake.address }
      );
      
      // Federation-specific handlers
      socket.on('federation:register', async (data) => {
        // Check governance
        if (this.governance.bannedNodes?.has(data.node_id)) {
          socket.emit('federation:error', { error: 'banned' });
          return;
        }
        await this.webSocketPool.handleNodeRegistration(socket, data);
      });
      
      socket.on('federation:heartbeat', async (data) => {
        await this.webSocketPool.handleHeartbeat(socket, data);
      });
      
      socket.on('federation:subscribe', async (data) => {
        await this.webSocketPool.handleSubscribe(socket, data);
      });
      
      socket.on('federation:message', async (data) => {
        // Check rate limit
        const nodeId = data.from_node || socket.node_id;
        const wsCheck = this.rateLimiter.checkWebSocketLimit(nodeId);
        if (!wsCheck.allowed) {
          socket.emit('federation:error', { error: wsCheck.error, retry_after: wsCheck.retry_after });
          return;
        }
        this.rateLimiter.recordWebSocketMessage(nodeId);
        
        // Log message (metadata only)
        this.auditLogger.logMessageSend(nodeId, data.to_node, data.message_id, {
          channel: data.channel,
          size_bytes: JSON.stringify(data).length
        });
        
        // Persist message if needed
        if (data.persist) {
          await this.messagePersistence.storeMessage(data);
        }
        
        await this.webSocketPool.handleMessage(socket, data);
      });
      
      // Entity registration for Nexus UI
      socket.on('entity:register', async (data) => {
        await this.entityRegistry.handleRegistration(socket, data);
      });
      
      // Knowledge sync handlers
      socket.on('federation:knowledge:sync', async (data) => {
        if (!this.degradation.isFeatureEnabled('knowledge_sync')) {
          socket.emit('federation:error', { error: 'feature_disabled' });
          return;
        }
        const result = await this.knowledgeSync.executeSync(data);
        socket.emit('federation:knowledge:sync:result', result);
      });
      
      // File transfer handlers
      socket.on('federation:file:upload', async (data) => {
        if (!this.degradation.isFeatureEnabled('file_transfer')) {
          socket.emit('federation:error', { error: 'feature_disabled' });
          return;
        }
        const result = await this.fileTransfer.uploadFile(data.content, data.metadata);
        socket.emit('federation:file:upload:result', result);
      });
      
      socket.on('disconnect', () => {
        this.metrics.decGauge('federation_websocket_connections');
        this.webSocketPool.handleDisconnect(socket);
        
        // Deliver any pending messages on reconnect
        if (socket.node_id) {
          // Messages will be delivered when node reconnects
        }
      });
    });
  }

  // Get federation status
  async getStatus() {
    const nodeStats = await this.nodeRegistry.getStats();
    const healthStatus = await this.healthAggregator.getFederationHealth();
    const entityStats = await this.entityRegistry.getStats();
    const governanceStatus = this.governance.getStatus();
    const degradationStatus = this.degradation.getStatus();
    
    return {
      status: degradationStatus.degradation_level > 0 ? 'degraded' : 'operational',
      federation: {
        mode: governanceStatus.mode,
        nodes_online: nodeStats.online,
        nodes_total: nodeStats.total,
        entities_registered: entityStats.total
      },
      health: healthStatus,
      governance: governanceStatus,
      degradation: degradationStatus,
      services: this.getServiceList(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  getServiceList() {
    return {
      p0: ['node_registry', 'websocket_pool', 'health_aggregator'],
      p1: ['service_router', 'model_registry', 'task_queue', 'event_bus'],
      p2: [
        'knowledge_sync', 'identity_auth', 'secrets_vault', 'message_persistence',
        'file_transfer', 'rate_limiter', 'audit_logger', 'offline_queue',
        'governance', 'metrics', 'degradation', 'p2p_fallback'
      ],
      nexus: ['entity_registry', 'access_control', 'nexus_api']
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down Federation Hub...');
    
    // Stop background jobs
    this.messagePersistence.stopCleanupJob();
    this.auditLogger.stopCleanupJob();
    this.rateLimiter.stopResetJob();
    this.metrics.stopHealthReflection();
    this.degradation.stopMonitoring();
    this.p2pFallback.stopProbing();
    
    // Emit shutdown event
    await this.eventBus.emit({
      event_type: 'federation.hub.shutdown',
      data: { timestamp: new Date().toISOString() }
    });
    
    console.log('✅ Federation Hub shutdown complete');
  }
}

module.exports = FederationHub;
