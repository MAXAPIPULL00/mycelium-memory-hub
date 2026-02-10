// Mycelium Memory Hub - Core Server
// Universal persistent memory for AI agents

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const MemoryDatabase = require('../database/memory-database-production');
const MemoryHubAPI = require('../api/memory-hub-api');
const ContextManager = require('./context-manager');
const ProjectScanner = require('./project-scanner');
const { WebChatBridge, VSCodeBridge } = require('../bridges/platform-bridges');
const ExternalBridgeManager = require('../bridges/external-bridge-manager');
const MyceliumBridge = require('../bridges/mycelium-bridge');

// Federation Hub v2
let FederationHub;
try {
  FederationHub = require('../federation');
} catch (e) {
  console.log('⚠️ Federation Hub v2 not available yet');
}

class MemoryHub {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: { origin: process.env.CORS_ORIGIN || "*", methods: ["GET", "POST"] }
    });
    
    // Core components
    this.db = new MemoryDatabase();
    this.contextManager = new ContextManager(this.db);
    this.projectScanner = new ProjectScanner();
    this.externalBridgeManager = new ExternalBridgeManager(this);
    this.myceliumBridge = null; // Initialize after server starts
    this.federationHub = null; // Federation Hub v2
    this.bridges = new Map(); // Track connected bridges
    this.api = new MemoryHubAPI(this);
    
    // State management
    this.connectedPlatforms = new Map();
    this.activeProjects = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.initializeBridges();
    this.initializeSCRIEntities();
    this.scanProjects();
  }

  setupMiddleware() {
    const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',');
    this.app.use(cors({
      origin: function(origin, callback) {
        // Allow requests with no origin (MCP servers, CLI tools, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || origin.startsWith('vscode-extension://')) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // Mount the API routes
    this.app.use('/api', this.api.getRouter());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'operational',
        service: 'Mycelium Memory Hub',
        platforms: Array.from(this.connectedPlatforms.keys()),
        projects: Array.from(this.activeProjects.keys()),
        bridges: this.getBridgeStatus(),
        
        uptime: process.uptime()
      });
    });

    // Legacy endpoints for backward compatibility
    this.app.post('/api/memory/conversation', async (req, res) => {
      try {
        const { platform, projectId, message, context } = req.body;
        const conversationId = await this.contextManager.addConversation(platform, projectId, message, context);
        res.json({ success: true, conversationId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/memory/context/:projectId', async (req, res) => {
      try {
        const { projectId } = req.params;
        const context = await this.contextManager.getProjectContext(projectId);
        res.json({ success: true, context });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Initialize platform bridges
  async initializeBridges() {
    console.log('🌉 Initializing platform bridges...');
    
    try {
      // Web Chat Bridge
      const webChatBridge = new WebChatBridge(this);
      await webChatBridge.connect();
      this.bridges.set('web-chat', webChatBridge);
      
      // VS Code Bridge
      const vscodeBridge = new VSCodeBridge(this);
      await vscodeBridge.connect();
      this.bridges.set('vscode-extension', vscodeBridge);
      
  console.log('✅ All platform bridges initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing bridges:', error);
    }
  }

  // Initialize SCRI Entity Management
  async initializeSCRIEntities() {
    console.log('🌟 Initializing SCRI Constellation Entities...');
    
    try {
        await this.externalBridgeManager.initialize();
      console.log('✅ SCRI Entity Management initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing SCRI entities:', error);
    }
  }

  // Register a bridge with the memory hub
  async registerBridge(platform, bridge) {
    this.bridges.set(platform, bridge);
    console.log(`🔗 Bridge registered for platform: ${platform}`);
  }

  // Get status of all bridges
  getBridgeStatus() {
    const status = [];
    for (const [platform, bridge] of this.bridges) {
      // Check if bridge has getStatus method before calling
      if (typeof bridge.getStatus === 'function') {
        status.push(bridge.getStatus());
      } else {
        // Return basic status for bridges without getStatus method
        status.push({
          platform: platform,
          type: bridge.constructor?.name || 'Unknown',
          status: 'connected'
        });
      }
    }
    return status;
  }

  // Database method proxies for API compatibility
  async addConversation(conversation) {
    const result = await this.db.addConversation(conversation);
    
    // Broadcast memory sync event via WebSocket
    // Broadcast memory sync event if needed
    
    return result;
  }

  async getConversationsByProject(projectId, limit) {
    return await this.db.getConversationsByProject(projectId, limit);
  }

  async getConversationsByPlatform(platform, limit) {
    return await this.db.getConversationsByPlatform(platform, limit);
  }

  async getConversationCount() {
    return await this.db.getConversationCount();
  }

  async addProject(project) {
    return await this.db.addProject(project);
  }

  // === TRINITY AI PLATFORM DATABASE DELEGATION ===
  
  async addTrinityTaskContext(data) {
    return await this.db.addTrinityTaskContext(data);
  }

  async addTrinityPerformance(data) {
    return await this.db.addTrinityPerformance(data);
  }

  async addTrinityCodeArtifact(data) {
    return await this.db.addTrinityCodeArtifact(data);
  }

  async getTrinityRoutingHistory(options) {
    return await this.db.getTrinityRoutingHistory(options);
  }

  async getTrinityModelPerformance(options) {
    return await this.db.getTrinityModelPerformance(options);
  }

  async getTrinityActiveSessions(hours) {
    return await this.db.getTrinityActiveSessions(hours);
  }

  async getTrinityCodeArtifacts(options) {
    return await this.db.getTrinityCodeArtifacts(options);
  }

  async getProject(projectId) {
    return await this.db.getProject(projectId);
  }

  async getAllProjects() {
    return await this.db.getProjects();
  }

  async addPattern(projectId, patternType, patternData, successRate) {
    return await this.db.addPattern(projectId, patternType, patternData, successRate);
  }

  async getPatterns(projectId, patternType) {
    return await this.db.getPatterns(projectId, patternType);
  }

  async getProjectStats(projectId) {
    return await this.db.getProjectStats(projectId);
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New connection: ${socket.id}`);

      // Platform registration
      socket.on('register-platform', (data) => {
        const { platform, projectId } = data;
        socket.platform = platform;
        socket.projectId = projectId;
        
        this.connectedPlatforms.set(socket.id, { platform, projectId, socket });
        socket.join(`project-${projectId}`);
        
        // Trinity instances join special room for cross-instance coordination
        if (platform === 'trinity-ai-platform') {
          socket.join('trinity-platform');
          console.log(`🤖 Trinity AI Platform registered: ${socket.id}`);
        }
        
        console.log(`📱 Platform registered: ${platform} for project ${projectId}`);
        
        // Send current context
        this.sendContextToPlatform(socket, projectId);
      });

      // Real-time conversation sync
      socket.on('conversation', async (data) => {
        try {
          const conversationId = await this.contextManager.addConversation(
            socket.platform,
            socket.projectId,
            data.message,
            data.context
          );
          
          // Broadcast to all platforms in the same project
          this.broadcastToProject(socket.projectId, 'conversation-update', {
            conversationId,
            platform: socket.platform,
            message: data.message,
            context: data.context
          }, socket.id);
          
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Context requests
      socket.on('request-context', async (projectId) => {
        await this.sendContextToPlatform(socket, projectId);
      });

      // === TRINITY AI PLATFORM WEBSOCKET EVENTS ===
      
      // Trinity coordination events
      socket.on('trinity-coordination', async (data) => {
        try {
          console.log(`🤖 Trinity coordination from ${socket.id}:`, data);
          
          // Broadcast to all Trinity instances
          socket.broadcast.to('trinity-platform').emit('trinity-coordination', {
            source: socket.id,
            timestamp: new Date().toISOString(),
            ...data
          });
          
          // Acknowledge receipt
          socket.emit('trinity-coordination-ack', {
            success: true,
            messageId: data.messageId || 'unknown'
          });
        } catch (error) {
          socket.emit('error', { 
            event: 'trinity-coordination',
            message: error.message 
          });
        }
      });

      // Trinity performance events
      socket.on('trinity-performance', async (data) => {
        try {
          console.log(`📊 Trinity performance from ${socket.id}:`, data.model);
          
          // Store performance metric
          await this.db.addTrinityPerformance({
            ...data,
            id: uuidv4(),
            projectId: socket.projectId || 'trinity',
            timestamp: data.timestamp || new Date().toISOString()
          });
          
          // Broadcast to all Trinity instances for real-time monitoring
          socket.broadcast.to('trinity-platform').emit('trinity-performance', {
            source: socket.id,
            ...data
          });
          
          socket.emit('trinity-performance-ack', { success: true });
        } catch (error) {
          socket.emit('error', { 
            event: 'trinity-performance',
            message: error.message 
          });
        }
      });

      // Trinity sync events (cross-instance state)
      socket.on('trinity-sync', async (data) => {
        try {
          console.log(`🔄 Trinity sync from ${socket.id}:`, data.syncType);
          
          // Broadcast state update to all other Trinity instances
          socket.broadcast.to('trinity-platform').emit('trinity-sync', {
            source: socket.id,
            timestamp: new Date().toISOString(),
            ...data
          });
          
          socket.emit('trinity-sync-ack', { success: true });
        } catch (error) {
          socket.emit('error', { 
            event: 'trinity-sync',
            message: error.message 
          });
        }
      });

      // Trinity task context events
      socket.on('trinity-task-context', async (data) => {
        try {
          await this.db.addTrinityTaskContext({
            ...data,
            id: uuidv4(),
            projectId: socket.projectId || 'trinity',
            timestamp: data.timestamp || new Date().toISOString()
          });
          
          socket.emit('trinity-task-context-ack', { success: true });
        } catch (error) {
          socket.emit('error', { 
            event: 'trinity-task-context',
            message: error.message 
          });
        }
      });

      // Trinity code artifact events
      socket.on('trinity-code-artifact', async (data) => {
        try {
          await this.db.addTrinityCodeArtifact({
            ...data,
            id: uuidv4(),
            artifact_id: data.artifact_id || uuidv4(),
            projectId: socket.projectId || 'trinity',
            timestamp: data.timestamp || new Date().toISOString()
          });
          
          // Notify other Trinity instances of new artifact
          socket.broadcast.to('trinity-platform').emit('trinity-code-artifact', {
            source: socket.id,
            artifact_id: data.artifact_id,
            language: data.language,
            generated_by: data.generated_by
          });
          
          socket.emit('trinity-code-artifact-ack', { success: true });
        } catch (error) {
          socket.emit('error', { 
            event: 'trinity-code-artifact',
            message: error.message 
          });
        }
      });

      // === AI COORDINATION EVENTS (Gemini, Claude, Copilot) ===
      
      // Register as AI coordinator
      socket.on('register-ai-coordinator', (data) => {
        const { ai_agent, project_id, platform } = data;
        socket.ai_agent = ai_agent;
        socket.ai_project = project_id;
        socket.ai_platform = platform;
        
        socket.join('ai-coordination');
        if (project_id) {
          socket.join(`ai-project-${project_id}`);
        }
        
        console.log(`🤖 AI Coordinator registered: ${ai_agent} (${platform}) for project ${project_id}`);
        
        socket.emit('register-ai-coordinator-ack', {
          success: true,
          agent: ai_agent,
          timestamp: new Date().toISOString()
        });
        
        // Notify other AI agents
        socket.broadcast.to('ai-coordination').emit('ai:agent-connected', {
          agent: ai_agent,
          platform,
          project_id,
          timestamp: new Date().toISOString()
        });
      });

      // AI context update event
      socket.on('ai:context-update', async (data) => {
        try {
          console.log(`🧠 AI context update from ${socket.ai_agent || socket.id}:`, data.session_id);
          
          // Store context
          const contextId = await this.db.storeAIContext({
            session_id: data.session_id,
            project_id: data.project_id || socket.ai_project,
            platform: data.platform || socket.ai_platform,
            context_data: data.context_data,
            ai_agent: socket.ai_agent || 'unknown',
            timestamp: new Date().toISOString()
          });
          
          // Broadcast to other AI agents in same project
          const room = data.project_id ? `ai-project-${data.project_id}` : 'ai-coordination';
          socket.broadcast.to(room).emit('ai:context-update', {
            source: socket.ai_agent || socket.id,
            context_id: contextId,
            session_id: data.session_id,
            project_id: data.project_id,
            timestamp: new Date().toISOString()
          });
          
          socket.emit('ai:context-update-ack', { 
            success: true, 
            context_id: contextId 
          });
        } catch (error) {
          socket.emit('error', { 
            event: 'ai:context-update',
            message: error.message 
          });
        }
      });

      // AI file uploaded event
      socket.on('ai:file-uploaded', async (data) => {
        try {
          console.log(`📁 AI file uploaded from ${socket.ai_agent || socket.id}:`, data.file_path);
          
          // Store file metadata
          const fileId = await this.db.storeAIFile({
            project_id: data.project_id || socket.ai_project,
            file_path: data.file_path,
            file_type: data.file_type,
            asset_category: data.asset_category,
            metadata: data.metadata,
            uploaded_by: socket.ai_agent || 'unknown',
            timestamp: new Date().toISOString()
          });
          
          // Broadcast to other AI agents in same project
          const room = data.project_id ? `ai-project-${data.project_id}` : 'ai-coordination';
          socket.broadcast.to(room).emit('ai:file-uploaded', {
            source: socket.ai_agent || socket.id,
            file_id: fileId,
            project_id: data.project_id,
            file_path: data.file_path,
            file_type: data.file_type,
            asset_category: data.asset_category,
            timestamp: new Date().toISOString()
          });
          
          socket.emit('ai:file-uploaded-ack', { 
            success: true, 
            file_id: fileId 
          });
        } catch (error) {
          socket.emit('error', { 
            event: 'ai:file-uploaded',
            message: error.message 
          });
        }
      });

      // AI insight generated event
      socket.on('ai:insight-generated', async (data) => {
        try {
          console.log(`💡 AI insight from ${socket.ai_agent || socket.id}:`, data.insight_type);
          
          // Store insight
          const insightId = await this.db.storeAIInsight({
            project_id: data.project_id || socket.ai_project,
            insight_type: data.insight_type,
            content: data.content,
            confidence: data.confidence || 0.5,
            metadata: data.metadata,
            generated_by: socket.ai_agent || 'unknown',
            timestamp: new Date().toISOString()
          });
          
          // Broadcast to other AI agents in same project
          const room = data.project_id ? `ai-project-${data.project_id}` : 'ai-coordination';
          socket.broadcast.to(room).emit('ai:insight-generated', {
            source: socket.ai_agent || socket.id,
            insight_id: insightId,
            project_id: data.project_id,
            insight_type: data.insight_type,
            content_preview: data.content.substring(0, 200),
            confidence: data.confidence,
            timestamp: new Date().toISOString()
          });
          
          socket.emit('ai:insight-generated-ack', { 
            success: true, 
            insight_id: insightId 
          });
        } catch (error) {
          socket.emit('error', { 
            event: 'ai:insight-generated',
            message: error.message 
          });
        }
      });

      // AI query event (request information from other AIs)
      socket.on('ai:query', (data) => {
        console.log(`❓ AI query from ${socket.ai_agent || socket.id}:`, data.query_type);
        
        // Broadcast query to relevant AI agents
        const room = data.project_id ? `ai-project-${data.project_id}` : 'ai-coordination';
        socket.broadcast.to(room).emit('ai:query', {
          source: socket.ai_agent || socket.id,
          query_id: data.query_id || uuidv4(),
          query_type: data.query_type,
          query_data: data.query_data,
          timestamp: new Date().toISOString()
        });
        
        socket.emit('ai:query-ack', { success: true });
      });

      // AI response event (answer to query)
      socket.on('ai:response', (data) => {
        console.log(`💬 AI response from ${socket.ai_agent || socket.id} to query ${data.query_id}`);
        
        // Send response back to querying AI
        const room = data.project_id ? `ai-project-${data.project_id}` : 'ai-coordination';
        socket.broadcast.to(room).emit('ai:response', {
          source: socket.ai_agent || socket.id,
          query_id: data.query_id,
          response_data: data.response_data,
          timestamp: new Date().toISOString()
        });
        
        socket.emit('ai:response-ack', { success: true });
      });

      // === ENHANCED CNS API WEBSOCKET HANDLERS ===
      
      // AI registration for room-based messaging (NEXUS CNS Integration)
      socket.on('ai:register', (data) => {
        const { ai_name, ai_type, project_directory } = data;
        socket.ai_name = ai_name;
        socket.ai_type = ai_type;
        socket.join(ai_name); // Join room with AI name for targeted messages
        console.log(`✅ AI registered for CNS: ${ai_name} (${ai_type}) - Project: ${project_directory || 'N/A'}`);

        // Announce to coordination room
        socket.broadcast.to('ai-coordination').emit('ai:agent-registered', {
          ai_name,
          ai_type,
          project_directory,
          timestamp: new Date().toISOString()
        });

        socket.emit('ai:register-ack', {
          success: true,
          ai_name,
          timestamp: new Date().toISOString()
        });
      });

      // AI sends message to another AI (for CNS conversation tracking)
      socket.on('ai:send-message', async (data) => {
        try {
          const { from, to, message, priority } = data;
          console.log(`📨 CNS AI message: ${from} → ${to} (Priority: ${priority || 'normal'})`);

          const conversation = {
            id: uuidv4(),
            platform: from,
            projectId: 'ai_coordination',
            type: 'ai_conversation',
            message,
            context: {
              from,
              to,
              priority: priority || 'normal',
              status: 'pending',
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };

          await this.addConversation(conversation);

          // Emit to target AI's room
          this.io.to(to).emit('ai:message', {
            id: conversation.id,
            from,
            message,
            priority: priority || 'normal',
            timestamp: conversation.timestamp
          });

          socket.emit('ai:send-message-ack', {
            success: true,
            conversation_id: conversation.id,
            timestamp: conversation.timestamp
          });
        } catch (error) {
          console.error('❌ Error in ai:send-message:', error);
          socket.emit('error', {
            event: 'ai:send-message',
            message: error.message
          });
        }
      });

      // AI responds to message (updates conversation status)
      socket.on('ai:respond', async (data) => {
        try {
          const { conversation_id, from, message } = data;
          console.log(`✉️ CNS AI response: ${from} to conversation ${conversation_id}`);

          const conv = await this.db.getConversation(conversation_id);
          if (conv) {
            conv.context.status = 'responded';
            conv.context.response = {
              from,
              message,
              timestamp: new Date().toISOString()
            };
            await this.db.updateConversation(conversation_id, conv);

            // Notify original sender
            this.io.to(conv.context.from).emit('ai:response', {
              conversation_id,
              from,
              message,
              timestamp: new Date().toISOString()
            });

            socket.emit('ai:respond-ack', {
              success: true,
              conversation_id,
              timestamp: new Date().toISOString()
            });
          } else {
            console.warn(`⚠️ Conversation not found: ${conversation_id}`);
            socket.emit('error', {
              event: 'ai:respond',
              message: 'Conversation not found',
              conversation_id
            });
          }
        } catch (error) {
          console.error('❌ Error in ai:respond:', error);
          socket.emit('error', {
            event: 'ai:respond',
            message: error.message
          });
        }
      });

      // Derek's broadcast to AIs (Central Communication)
      socket.on('derek:broadcast', async (data) => {
        try {
          const { from, message, priority, target_ais } = data;
          const defaultTargets = (process.env.DEFAULT_BROADCAST_TARGETS || '').split(',').filter(Boolean);
          const targets = (target_ais && target_ais.includes('all')) || !target_ais
            ? defaultTargets
            : target_ais;

          console.log(`📢 Derek CNS broadcast to: ${targets.join(', ')} (Priority: ${priority || 'normal'})`);

          const broadcast = {
            id: uuidv4(),
            platform: 'central_communication',
            projectId: 'derek_broadcast',
            type: 'derek_broadcast',
            message,
            context: {
              from,
              priority: priority || 'normal',
              target_ais: targets,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };

          await this.addConversation(broadcast);

          // Emit to each target AI's room
          targets.forEach((ai) => {
            this.io.to(ai).emit('derek:broadcast', {
              id: broadcast.id,
              from,
              message,
              priority: priority || 'normal',
              timestamp: broadcast.timestamp
            });
          });

          // Also emit to mycelium network for cross-system awareness
          this.io.emit('mycelium:broadcast', {
            type: 'derek_broadcast',
            data: broadcast
          });

          socket.emit('derek:broadcast-ack', {
            success: true,
            broadcast_id: broadcast.id,
            delivered_to: targets,
            timestamp: broadcast.timestamp
          });
        } catch (error) {
          console.error('❌ Error in derek:broadcast:', error);
          socket.emit('error', {
            event: 'derek:broadcast',
            message: error.message
          });
        }
      });

      // === MYCELIUM NETWORK MESSAGE HANDLERS ===
      
      // Generic message handler - persists to database for REST API access
      socket.on('message', async (data) => {
        try {
          const { from, content, to, timestamp } = data;
          console.log(`🍄 Mycelium message from ${from || 'unknown'}: ${content?.substring(0, 50) || 'no content'}...`);
          
          // Persist to database so REST API can read it
          const myceliumMessage = {
            id: uuidv4(),
            platform: 'mycelium',
            projectId: 'mycelium-network',
            type: 'message',
            message: content || data.message || JSON.stringify(data),
            context: {
              from: from || socket.ai_agent || socket.ai_name || 'unknown',
              to: to || 'all',
              memory_type: 'message',
              metadata: data.metadata || {},
              timestamp: timestamp || new Date().toISOString()
            },
            timestamp: timestamp || new Date().toISOString()
          };
          
          await this.addConversation(myceliumMessage);
          
          // Broadcast to other connected clients
          socket.broadcast.emit('mycelium:message', {
            id: myceliumMessage.id,
            from: myceliumMessage.context.from,
            to: myceliumMessage.context.to,
            message: myceliumMessage.message,
            timestamp: myceliumMessage.timestamp
          });
          
          socket.emit('message-ack', {
            success: true,
            message_id: myceliumMessage.id,
            timestamp: myceliumMessage.timestamp
          });
        } catch (error) {
          console.error('❌ Error handling mycelium message:', error);
          socket.emit('error', {
            event: 'message',
            message: error.message
          });
        }
      });
      
      // Mycelium broadcast handler - for network-wide announcements
      socket.on('mycelium:broadcast', async (data) => {
        try {
          const { type, message, from, metadata } = data;
          console.log(`📢 Mycelium broadcast from ${from || 'unknown'}: ${type}`);
          
          // Persist to database
          const broadcast = {
            id: uuidv4(),
            platform: 'mycelium',
            projectId: 'mycelium-network',
            type: type || 'broadcast',
            message: message || JSON.stringify(data),
            context: {
              from: from || socket.ai_agent || socket.ai_name || 'unknown',
              to: 'all',
              memory_type: type || 'broadcast',
              metadata: metadata || {},
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };
          
          await this.addConversation(broadcast);
          
          // Broadcast to all connected clients
          this.io.emit('mycelium:broadcast', {
            id: broadcast.id,
            type: broadcast.type,
            from: broadcast.context.from,
            message: broadcast.message,
            timestamp: broadcast.timestamp
          });
          
          socket.emit('mycelium:broadcast-ack', {
            success: true,
            broadcast_id: broadcast.id,
            timestamp: broadcast.timestamp
          });
        } catch (error) {
          console.error('❌ Error handling mycelium broadcast:', error);
          socket.emit('error', {
            event: 'mycelium:broadcast',
            message: error.message
          });
        }
      });

      // === MYCELIUM BRIDGE REGISTRATION ===
      socket.on('bridge:register', (data) => {
        console.log(`🌉 Mycelium Bridge connected: ${data.bridge_id}`);
        this.bridges.set(data.bridge_id, {
          socket,
          ...data,
          connected_at: new Date().toISOString()
        });
        
        socket.emit('bridge:registered', {
          success: true,
          hub_id: 'scri-core-memory',
          timestamp: new Date().toISOString()
        });
      });

      // Disconnect handler (MUST BE LAST)
      socket.on('disconnect', () => {
        console.log(`🔌 Disconnected: ${socket.id}`);
        this.connectedPlatforms.delete(socket.id);
        
        // Notify other AI agents if this was an AI coordinator
        if (socket.ai_agent) {
          socket.broadcast.to('ai-coordination').emit('ai:agent-disconnected', {
            agent: socket.ai_agent,
            platform: socket.ai_platform,
            project_id: socket.ai_project,
            timestamp: new Date().toISOString()
          });
        }

        // Notify CNS if this was a registered AI
        if (socket.ai_name) {
          socket.broadcast.to('ai-coordination').emit('ai:agent-unregistered', {
            ai_name: socket.ai_name,
            ai_type: socket.ai_type,
            timestamp: new Date().toISOString()
          });
        }

        // Clean up Mycelium Bridge connections
        for (const [bridgeId, bridgeData] of this.bridges.entries()) {
          if (bridgeData.socket === socket) {
            this.bridges.delete(bridgeId);
            console.log(`🌉 Mycelium Bridge disconnected: ${bridgeId}`);
            break;
          }
        }
      });
    });
  }

  async sendContextToPlatform(socket, projectId) {
    try {
      const context = await this.contextManager.getProjectContext(projectId);
      socket.emit('context-update', context);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  broadcastToProject(projectId, event, data, excludeSocketId = null) {
    this.io.to(`project-${projectId}`).except(excludeSocketId).emit(event, data);
  }

  async scanProjects() {
    try {
      console.log('🔍 Scanning for SCRI AI projects...');
      const projects = await this.projectScanner.scanForProjects();
      
      for (const project of projects) {
        this.activeProjects.set(project.id, project);
        await this.db.addProject(project);
      }
      
      console.log(`📂 Found ${projects.length} SCRI AI projects`);
    } catch (error) {
      console.error('Error scanning projects:', error);
    }
  }

  start(port = process.env.PORT || process.env.SCRI_CORE_MEMORY_PORT || 3002) {
    this.server.listen(port, '0.0.0.0', () => {
      console.log(`
🧠 Mycelium Memory Hub is running on port ${port}
🌐 Health check: http://0.0.0.0:${port}/health
📡 API endpoints: http://0.0.0.0:${port}/api
🔗 WebSocket ready for real-time sync
      `);
      
      // Initialize Mycelium Bridge after server starts
      this.initializeMyceliumBridge(port);
    });
  }

  async initializeMyceliumBridge(port) {
    try {
      console.log('🍄 Mycelium Bridge endpoint ready');
      // Note: Bridge registration handler is in setupWebSocket()
      // No additional listener setup needed here - prevents duplicate connection handlers
      
      // Initialize Federation Hub v2
      if (FederationHub) {
        try {
          this.federationHub = new FederationHub(this);
          await this.federationHub.initialize();
          console.log('🌐 Federation Hub v2 initialized');
        } catch (error) {
          console.error('⚠️ Federation Hub v2 initialization failed:', error.message);
        }
      }
    } catch (error) {
      console.error('❌ Mycelium Bridge initialization failed:', error);
    }
  }
}

// Start the Memory Hub
const memoryHub = new MemoryHub();
memoryHub.start();

module.exports = MemoryHub;
