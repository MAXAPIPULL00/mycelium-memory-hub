// SCRI Mycelium Network Bridge
// Unifies local daemon (localhost:8700) + cloud hub (scri-core-memory.fly.dev)
// Handles entity registration, approval, and message routing

const io = require('socket.io-client');
const EventEmitter = require('events');

class MyceliumBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      localDaemonUrl: config.localDaemonUrl || 'http://localhost:8700',
      cloudHubUrl: config.cloudHubUrl || process.env.CLOUD_HUB_URL || 'http://localhost:3002',
      autoApproveScri: config.autoApproveScri !== false,
      requireApprovalFor: config.requireApprovalFor || ['external', 'unknown'],
      ...config
    };
    
    // Connection states
    this.localDaemon = null;
    this.cloudHub = null;
    this.localConnected = false;
    this.cloudConnected = false;
    
    // Entity management
    this.connectedEntities = new Map();
    this.approvedEntities = new Set();
    this.pendingApprovals = [];
    this.trustedIntroducers = new Set(
      (config.trustedIntroducers || process.env.TRUSTED_INTRODUCERS || '').split(',').filter(Boolean)
    );
    
    // Message routing
    this.messageQueue = [];
    this.routingRules = new Map();
    
    console.log('🍄 Mycelium Bridge initialized');
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  async initialize() {
    console.log('🌐 Connecting to mycelium network...');
    
    try {
      await Promise.all([
        this.connectLocalDaemon(),
        this.connectCloudHub()
      ]);
      
      this.setupBridge();
      this.setupApprovalSystem();
      this.processQueuedMessages();
      
      console.log('✅ Mycelium Bridge operational');
      console.log(`   Local Daemon: ${this.localConnected ? '✅' : '❌'}`);
      console.log(`   Cloud Hub: ${this.cloudConnected ? '✅' : '❌'}`);
      
      this.emit('bridge:ready');
    } catch (error) {
      console.error('❌ Bridge initialization failed:', error);
      this.emit('bridge:error', error);
    }
  }

  async connectLocalDaemon() {
    return new Promise((resolve, reject) => {
      this.localDaemon = io(this.config.localDaemonUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
      });

      this.localDaemon.on('connect', () => {
        console.log('🔌 Connected to local daemon');
        this.localConnected = true;
        this.emit('local:connected');
        resolve();
      });

      this.localDaemon.on('disconnect', () => {
        console.log('🔌 Disconnected from local daemon');
        this.localConnected = false;
        this.emit('local:disconnected');
      });

      this.localDaemon.on('connect_error', (error) => {
        console.error('❌ Local daemon connection error:', error.message);
        reject(error);
      });

      setTimeout(() => reject(new Error('Local daemon connection timeout')), 5000);
    });
  }

  async connectCloudHub() {
    return new Promise((resolve, reject) => {
      this.cloudHub = io(this.config.cloudHubUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
      });

      this.cloudHub.on('connect', () => {
        console.log('☁️ Connected to cloud hub');
        this.cloudConnected = true;
        this.emit('cloud:connected');
        
        // Register bridge as coordinator
        this.cloudHub.emit('register-ai-coordinator', {
          ai_agent: 'Mycelium-Bridge',
          project_id: 'scri-core-memory',
          platform: 'bridge'
        });
        
        resolve();
      });

      this.cloudHub.on('disconnect', () => {
        console.log('☁️ Disconnected from cloud hub');
        this.cloudConnected = false;
        this.emit('cloud:disconnected');
      });

      this.cloudHub.on('connect_error', (error) => {
        console.error('❌ Cloud hub connection error:', error.message);
        reject(error);
      });

      setTimeout(() => reject(new Error('Cloud hub connection timeout')), 5000);
    });
  }

  // ============================================
  // BRIDGE SETUP
  // ============================================
  
  setupBridge() {
    // Local → Cloud routing
    this.localDaemon.onAny((event, data) => {
      if (this.shouldBroadcastToCloud(event, data)) {
        console.log(`🔄 Local → Cloud: ${event}`);
        this.cloudHub.emit(event, {
          ...data,
          source: 'local_daemon',
          bridged: true
        });
      }
    });

    // Cloud → Local routing
    this.cloudHub.onAny((event, data) => {
      if (this.shouldBroadcastToLocal(event, data)) {
        console.log(`🔄 Cloud → Local: ${event}`);
        this.localDaemon.emit(event, {
          ...data,
          source: 'cloud_hub',
          bridged: true
        });
      }
    });

    // Bidirectional events
    this.setupBidirectionalEvents();
  }

  setupBidirectionalEvents() {
    const events = [
      'ai:context-update',
      'ai:file-uploaded',
      'ai:insight-generated',
      'ai:query',
      'ai:response',
      'ai:agent-connected',
      'ai:agent-disconnected',
      'message',
      'signal:broadcast'
    ];

    events.forEach(event => {
      this.addRoutingRule(event, 'bidirectional');
    });
  }

  // ============================================
  // ENTITY REGISTRATION & APPROVAL
  // ============================================
  
  setupApprovalSystem() {
    // Handle registration requests from both networks
    this.localDaemon.on('mycelium:register', (data) => this.handleRegistration(data, 'local'));
    this.cloudHub.on('mycelium:register', (data) => this.handleRegistration(data, 'cloud'));
  }

  async handleRegistration(data, source) {
    console.log(`📝 Registration request from ${data.entity_name} (${source})`);
    
    const registration = {
      ...data,
      source,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    // Check if auto-approve
    if (this.shouldAutoApprove(registration)) {
      console.log(`✅ Auto-approving ${data.entity_name}`);
      await this.approveEntity(registration);
    } else {
      console.log(`⏳ Manual approval required for ${data.entity_name}`);
      this.pendingApprovals.push(registration);
      this.notifyApprovalNeeded(registration);
    }
  }

  shouldAutoApprove(registration) {
    const { entity_type, introduced_by, auth_token } = registration;
    
    // Auto-approve SCRI core entities
    if (entity_type === 'scri_core') return true;
    
    // Auto-approve if introduced by trusted entity
    if (this.trustedIntroducers.has(introduced_by)) return true;
    
    // Auto-approve with valid SCRI entity token
    if (auth_token && this.validateEntityToken(auth_token)) return true;
    
    // Auto-approve SCRI projects if enabled
    if (this.config.autoApproveScri && entity_type === 'scri_project') return true;
    
    return false;
  }

  async approveEntity(registration) {
    const entity = {
      id: registration.entity_id,
      name: registration.entity_name,
      type: registration.entity_type,
      capabilities: registration.capabilities || [],
      access_level: this.calculateAccessLevel(registration),
      channels: this.assignChannels(registration),
      approved_at: new Date().toISOString(),
      approved_by: registration.introduced_by || 'Auto-Approved'
    };

    // Add to approved set
    this.approvedEntities.add(entity.id);
    this.connectedEntities.set(entity.id, entity);

    // Connect to requested networks
    const connections = [];
    if (registration.requesting_access?.includes('local_daemon') && this.localConnected) {
      connections.push(this.connectEntityToLocal(entity));
    }
    if (registration.requesting_access?.includes('cloud_hub') && this.cloudConnected) {
      connections.push(this.connectEntityToCloud(entity));
    }

    await Promise.all(connections);

    // Notify entity of approval
    this.notifyEntityApproved(entity, registration.source);

    // Broadcast to network
    this.broadcast('entity:connected', entity);

    this.emit('entity:approved', entity);
    
    return entity;
  }

  async denyEntity(registration, reason) {
    console.log(`❌ Denied ${registration.entity_name}: ${reason}`);
    
    this.notifyEntityDenied(registration, reason);
    this.emit('entity:denied', { registration, reason });
  }

  calculateAccessLevel(registration) {
    const { entity_type, introduced_by } = registration;
    
    if (entity_type === 'scri_core') return 'full';
    if (this.trustedIntroducers.has(introduced_by)) return 'elevated';
    if (entity_type === 'scri_project') return 'standard';
    return 'restricted';
  }

  assignChannels(registration) {
    const channels = [];
    const { access_level, entity_type, capabilities = [] } = registration;

    // Base channels for all
    channels.push('general');

    // Access level based channels
    if (access_level === 'full' || access_level === 'elevated') {
      channels.push('ai-coordination', 'global-broadcast');
    }
    if (access_level === 'standard') {
      channels.push('ai-coordination');
    }

    // Capability based channels
    if (capabilities.includes('code_generation')) channels.push('code-gen');
    if (capabilities.includes('deployment')) channels.push('deployment');
    if (capabilities.includes('chat')) channels.push('chat');

    // Project specific
    if (registration.project_id) {
      channels.push(`project-${registration.project_id}`);
    }

    return [...new Set(channels)];
  }

  async connectEntityToLocal(entity) {
    console.log(`🔌 Connecting ${entity.name} to local daemon`);
    this.localDaemon.emit('entity:join', entity);
  }

  async connectEntityToCloud(entity) {
    console.log(`☁️ Connecting ${entity.name} to cloud hub`);
    this.cloudHub.emit('register-ai-coordinator', {
      ai_agent: entity.name,
      project_id: entity.project_id || 'scri-core-memory',
      platform: entity.type
    });
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================
  
  notifyApprovalNeeded(registration) {
    // Emit to bridge listeners (NEXUS CNS, Derek, etc.)
    this.emit('approval:needed', registration);
    
    // Also broadcast to both networks
    const notification = {
      type: 'approval_request',
      entity: registration.entity_name,
      introduced_by: registration.introduced_by,
      timestamp: registration.timestamp
    };
    
    this.localDaemon?.emit('notification', notification);
    this.cloudHub?.emit('notification', notification);
  }

  notifyEntityApproved(entity, source) {
    const target = source === 'local' ? this.localDaemon : this.cloudHub;
    target?.emit('mycelium:registration-approved', {
      entity_id: entity.id,
      access_level: entity.access_level,
      allowed_channels: entity.channels,
      timestamp: new Date().toISOString()
    });
  }

  notifyEntityDenied(registration, reason) {
    const target = registration.source === 'local' ? this.localDaemon : this.cloudHub;
    target?.emit('mycelium:registration-denied', {
      entity_id: registration.entity_id,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // MESSAGE ROUTING
  // ============================================
  
  addRoutingRule(event, direction) {
    // direction: 'bidirectional', 'local-to-cloud', 'cloud-to-local'
    this.routingRules.set(event, direction);
  }

  shouldBroadcastToCloud(event, data) {
    // Don't forward already bridged messages
    if (data?.bridged) return false;
    
    const rule = this.routingRules.get(event);
    return rule === 'bidirectional' || rule === 'local-to-cloud';
  }

  shouldBroadcastToLocal(event, data) {
    // Don't forward already bridged messages
    if (data?.bridged) return false;
    
    const rule = this.routingRules.get(event);
    return rule === 'bidirectional' || rule === 'cloud-to-local';
  }

  broadcast(event, data) {
    if (this.localConnected) {
      this.localDaemon.emit(event, data);
    }
    if (this.cloudConnected) {
      this.cloudHub.emit(event, data);
    }
  }

  processQueuedMessages() {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.broadcast(msg.event, msg.data);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================
  
  validateEntityToken(token) {
    // TODO: Implement token validation
    // For now, accept tokens starting with 'scri-entity-'
    return token && token.startsWith('scri-entity-');
  }

  getConnectedEntities() {
    return Array.from(this.connectedEntities.values());
  }

  getPendingApprovals() {
    return [...this.pendingApprovals];
  }

  getEntityById(id) {
    return this.connectedEntities.get(id);
  }

  async disconnect() {
    console.log('🔌 Disconnecting mycelium bridge...');
    
    if (this.localDaemon) {
      this.localDaemon.disconnect();
    }
    if (this.cloudHub) {
      this.cloudHub.disconnect();
    }
    
    this.emit('bridge:disconnected');
  }
}

module.exports = MyceliumBridge;
