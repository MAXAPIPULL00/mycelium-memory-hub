// SCRI Core Memory Hub API - RESTful endpoints for cross-platform access
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const AIVisitorTracker = require('../core/ai-visitor-tracker');

class MemoryHubAPI {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.router = express.Router();
    this.visitorTracker = new AIVisitorTracker(memoryHub);
    this.setupRoutes();
    this.setupTrinityRoutes(); // Trinity AI Platform integration
    this.setupUniversalScriptsRoutes(); // Universal Scripts Library
    this.setupAICoordinationRoutes(); // AI-to-AI coordination (Gemini, Claude, Copilot)
    this.setupProjectScanRoutes(); // Universal project scanner
    this.setupVisitorLogRoutes(); // AI visitor tracking
    this.setupEnhancedVisitorRoutes(); // Enhanced visitor tracking with full content
    this.setupAIConversationRoutes(); // AI-to-AI conversation tracking
    this.setupMyceliumRoutes(); // Mycelium Network bidirectional communication
    this.setupCentralCommunicationRoutes(); // Derek's central communication broadcast
    this.setupAkashaIntegrationRoutes(); // Akasha + UDA cross-project memory integration
    this.setupARIAConsciousnessRoutes(); // ARIA consciousness integration endpoints
    
    // In-memory presence store for entity tracking
    this.entityPresence = new Map();
  }

  setupRoutes() {
    // Enable CORS for cross-platform access
    this.router.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:3001', 'vscode-extension://*'],
      credentials: true
    }));

    // Middleware for JSON parsing
    this.router.use(express.json({ limit: '10mb' }));

    // AI Visitor Tracking Middleware - tracks all requests
    this.router.use(this.visitorTracker.trackVisitor());

    // Health check
    this.router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        platform: 'scri-core-memory-hub',
        version: '1.0.0'
      });
    });

    // === CONVERSATION ENDPOINTS ===

    // Add new conversation
    this.router.post('/conversations', async (req, res) => {
      try {
        const conversation = {
          id: req.body.id || uuidv4(),
          platform: req.body.platform || 'unknown',
          projectId: req.body.projectId || 'general',
          message: req.body.message,
          context: req.body.context || {},
          timestamp: req.body.timestamp || new Date().toISOString(),
          type: req.body.type || 'general'
        };

        await this.memoryHub.addConversation(conversation);
        
        res.status(201).json({
          success: true,
          conversationId: conversation.id,
          message: 'Conversation added successfully'
        });
      } catch (error) {
        console.error('Error adding conversation:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add conversation',
          details: error.message
        });
      }
    });

    // Get conversations by project
    this.router.get('/conversations/project/:projectId', async (req, res) => {
      try {
        const { projectId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const platform = req.query.platform;

        let conversations;
        if (platform) {
          conversations = await this.memoryHub.getConversationsByPlatform(platform, limit);
          conversations = conversations.filter(c => c.project_id === projectId);
        } else {
          conversations = await this.memoryHub.getConversationsByProject(projectId, limit);
        }

        res.json({
          success: true,
          projectId,
          count: conversations.length,
          conversations
        });
      } catch (error) {
        console.error('Error getting conversations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get conversations',
          details: error.message
        });
      }
    });

    // Get conversations by platform
    this.router.get('/conversations/platform/:platform', async (req, res) => {
      try {
        const { platform } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        const conversations = await this.memoryHub.getConversationsByPlatform(platform, limit);

        res.json({
          success: true,
          platform,
          count: conversations.length,
          conversations
        });
      } catch (error) {
        console.error('Error getting conversations by platform:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get conversations',
          details: error.message
        });
      }
    });

    // === PROJECT ENDPOINTS ===

    // Get all projects
    this.router.get('/projects', async (req, res) => {
      try {
        const projects = await this.memoryHub.getAllProjects();
        
        res.json({
          success: true,
          count: projects.length,
          projects
        });
      } catch (error) {
        console.error('Error getting projects:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get projects',
          details: error.message
        });
      }
    });

    // Get specific project
    this.router.get('/projects/:projectId', async (req, res) => {
      try {
        const { projectId } = req.params;
        const project = await this.memoryHub.getProject(projectId);
        
        if (!project) {
          return res.status(404).json({
            success: false,
            error: 'Project not found'
          });
        }

        res.json({
          success: true,
          project
        });
      } catch (error) {
        console.error('Error getting project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get project',
          details: error.message
        });
      }
    });

    // Add or update project
    this.router.post('/projects', async (req, res) => {
      try {
        const project = {
          id: req.body.id || uuidv4(),
          name: req.body.name,
          path: req.body.path,
          type: req.body.type,
          framework: req.body.framework,
          lastModified: req.body.lastModified || new Date().toISOString(),
          aiEnabled: req.body.aiEnabled || false,
          config: req.body.config || {}
        };

        await this.memoryHub.addProject(project);
        
        res.status(201).json({
          success: true,
          projectId: project.id,
          message: 'Project added successfully'
        });
      } catch (error) {
        console.error('Error adding project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add project',
          details: error.message
        });
      }
    });

    // Project registration endpoint (for memory bridges)
    this.router.post('/projects/register', async (req, res) => {
      try {
        const { project_name, project_path, project_type, framework, bridge_id, metadata } = req.body;
        
        const project = {
          id: uuidv4(),
          name: project_name || 'Unknown Project',
          path: project_path || '',
          type: project_type || 'copilot_session',
          framework: framework || 'unknown',
          lastModified: new Date().toISOString(),
          aiEnabled: true,
          config: {
            bridge_id,
            metadata: metadata || {},
            registered_via: 'memory_bridge',
            registration_time: new Date().toISOString()
          }
        };

        await this.memoryHub.addProject(project);
        
        // Also store as conversation for tracking
        await this.memoryHub.addConversation({
          id: uuidv4(),
          platform: 'project_registry',
          projectId: project.id,
          message: `Project registered: ${project.name}`,
          context: {
            project_info: project,
            bridge_registration: true,
            registration_source: req.headers['user-agent'] || 'unknown'
          },
          timestamp: new Date().toISOString(),
          type: 'project_registration'
        });
        
        res.json({
          success: true,
          project_id: project.id,
          project_name: project.name,
          message: 'Project registered successfully',
          memory_hub_ready: true
        });
      } catch (error) {
        console.error('Error registering project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to register project',
          details: error.message
        });
      }
    });

    // === PATTERN ENDPOINTS ===

    // Get patterns for project
    this.router.get('/patterns/:projectId', async (req, res) => {
      try {
        const { projectId } = req.params;
        const patternType = req.query.type;

        const patterns = await this.memoryHub.getPatterns(projectId, patternType);

        res.json({
          success: true,
          projectId,
          patternType: patternType || 'all',
          count: patterns.length,
          patterns
        });
      } catch (error) {
        console.error('Error getting patterns:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get patterns',
          details: error.message
        });
      }
    });

    // Add new pattern
    this.router.post('/patterns', async (req, res) => {
      try {
        const { projectId, patternType, patternData, successRate } = req.body;

        const patternId = await this.memoryHub.addPattern(
          projectId,
          patternType,
          patternData,
          successRate || 0.0
        );

        res.status(201).json({
          success: true,
          patternId,
          message: 'Pattern added successfully'
        });
      } catch (error) {
        console.error('Error adding pattern:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add pattern',
          details: error.message
        });
      }
    });

    // === SYNC ENDPOINTS ===

    // Bulk sync conversations from platform
    this.router.post('/sync/conversations', async (req, res) => {
      try {
        const { platform, conversations } = req.body;
        
        if (!Array.isArray(conversations)) {
          return res.status(400).json({
            success: false,
            error: 'Conversations must be an array'
          });
        }

        let successCount = 0;
        let errorCount = 0;

        for (const conv of conversations) {
          try {
            await this.memoryHub.addConversation({
              id: conv.id || uuidv4(),
              platform: platform || conv.platform || 'unknown',
              projectId: conv.projectId || 'general',
              message: conv.message || conv.content,
              context: conv.context || {},
              timestamp: conv.timestamp || new Date().toISOString(),
              type: conv.type || 'general'
            });
            successCount++;
          } catch (error) {
            console.error('Error syncing conversation:', error);
            errorCount++;
          }
        }

        res.json({
          success: true,
          message: 'Bulk sync completed',
          total: conversations.length,
          successful: successCount,
          errors: errorCount
        });
      } catch (error) {
        console.error('Error in bulk sync:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to sync conversations',
          details: error.message
        });
      }
    });

    // === ANALYTICS ENDPOINTS ===

    // Get project statistics
    this.router.get('/analytics/project/:projectId', async (req, res) => {
      try {
        const { projectId } = req.params;
        const stats = await this.memoryHub.getProjectStats(projectId);

        res.json({
          success: true,
          projectId,
          stats
        });
      } catch (error) {
        console.error('Error getting project stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get project statistics',
          details: error.message
        });
      }
    });

    // Get overall memory hub statistics
    this.router.get('/analytics/overview', async (req, res) => {
      try {
        const totalConversations = await this.memoryHub.getConversationCount();
        const projects = await this.memoryHub.getAllProjects();
        const bridges = this.memoryHub.getBridgeStatus();

        res.json({
          success: true,
          overview: {
            totalConversations,
            totalProjects: projects.length,
            activeBridges: bridges.filter(b => b.connected).length,
            totalBridges: bridges.length,
            platforms: [...new Set(bridges.map(b => b.platform))],
            lastUpdate: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error getting overview stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get overview statistics',
          details: error.message
        });
      }
    });

    // === BRIDGE ENDPOINTS ===

    // Get bridge status
    this.router.get('/bridges/status', (req, res) => {
      try {
        const bridges = this.memoryHub.getBridgeStatus();
        
        res.json({
          success: true,
          bridges
        });
      } catch (error) {
        console.error('Error getting bridge status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get bridge status',
          details: error.message
        });
      }
    });

    // === SEARCH ENDPOINTS ===

    // Search conversations
    this.router.get('/search', async (req, res) => {
      try {
        const { q, platform, projectId, type, limit = 50 } = req.query;
        
        if (!q) {
          return res.status(400).json({
            success: false,
            error: 'Search query parameter "q" is required'
          });
        }

        // This is a simple implementation - in production you'd want full-text search
        let conversations = [];
        
        if (projectId) {
          conversations = await this.memoryHub.getConversationsByProject(projectId, limit);
        } else if (platform) {
          conversations = await this.memoryHub.getConversationsByPlatform(platform, limit);
        } else {
          // Get recent conversations from all projects
          const projects = await this.memoryHub.getAllProjects();
          for (const project of projects.slice(0, 10)) { // Limit to avoid performance issues
            const projectConvs = await this.memoryHub.getConversationsByProject(project.id, 20);
            conversations.push(...projectConvs);
          }
        }

        // Filter by search query
        const searchResults = conversations.filter(conv => 
          conv.message.toLowerCase().includes(q.toLowerCase()) ||
          JSON.stringify(conv.context).toLowerCase().includes(q.toLowerCase())
        ).slice(0, limit);

        res.json({
          success: true,
          query: q,
          count: searchResults.length,
          results: searchResults
        });
      } catch (error) {
        console.error('Error searching conversations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search conversations',
          details: error.message
        });
      }
    });

    // === FILE OPERATIONS ENDPOINTS ===

    // Create file through development platform
    this.router.post('/file-operations/create', async (req, res) => {
      try {
        const { filePath, content, projectId, platform = 'web-chat' } = req.body;
        
        if (!filePath || !content) {
          return res.status(400).json({
            success: false,
            error: 'filePath and content are required'
          });
        }

        // Forward to SCRI Core Memory Development Platform
        const devPlatformUrl = 'http://localhost:3001/api/files';
        const response = await fetch(devPlatformUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            filePath,
            content,
            source: 'memory-hub-bridge'
          })
        });

        if (response.ok) {
          const result = await response.json();
          
          // Log this file operation in memory
          await this.memoryHub.addConversation({
            id: uuidv4(),
            platform,
            projectId: projectId || 'web-chat-files',
            message: `File created: ${filePath}`,
            context: {
              action: 'file_creation',
              filePath,
              success: true,
              contentLength: content.length,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString(),
            type: 'file_operation'
          });

          res.json({
            success: true,
            message: 'File created successfully',
            filePath,
            devPlatformResponse: result
          });
        } else {
          const error = await response.text();
          res.status(500).json({
            success: false,
            error: 'Failed to create file through development platform',
            details: error
          });
        }
      } catch (error) {
        console.error('Error creating file:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create file',
          details: error.message
        });
      }
    });

    // Edit existing file
    this.router.post('/file-operations/edit', async (req, res) => {
      try {
        const { filePath, content, projectId, platform = 'web-chat' } = req.body;
        
        if (!filePath || !content) {
          return res.status(400).json({
            success: false,
            error: 'filePath and content are required'
          });
        }

        // Forward to SCRI Core Memory Development Platform
        const devPlatformUrl = 'http://localhost:3001/api/files';
        const response = await fetch(devPlatformUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'edit',
            filePath,
            content,
            source: 'memory-hub-bridge'
          })
        });

        if (response.ok) {
          const result = await response.json();
          
          // Log this file operation in memory
          await this.memoryHub.addConversation({
            id: uuidv4(),
            platform,
            projectId: projectId || 'web-chat-files',
            message: `File edited: ${filePath}`,
            context: {
              action: 'file_edit',
              filePath,
              success: true,
              contentLength: content.length,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString(),
            type: 'file_operation'
          });

          res.json({
            success: true,
            message: 'File edited successfully',
            filePath,
            devPlatformResponse: result
          });
        } else {
          const error = await response.text();
          res.status(500).json({
            success: false,
            error: 'Failed to edit file through development platform',
            details: error
          });
        }
      } catch (error) {
        console.error('Error editing file:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to edit file',
          details: error.message
        });
      }
    });

    // Read file contents
    this.router.get('/file-operations/read/:encodedPath', async (req, res) => {
      try {
        const filePath = decodeURIComponent(req.params.encodedPath);
        
        // Forward to SCRI Core Memory Development Platform
        const devPlatformUrl = `http://localhost:3001/api/files/${encodeURIComponent(filePath)}`;
        const response = await fetch(devPlatformUrl);

        if (response.ok) {
          const result = await response.json();
          res.json({
            success: true,
            filePath,
            content: result.content
          });
        } else {
          const error = await response.text();
          res.status(404).json({
            success: false,
            error: 'File not found or could not be read',
            details: error
          });
        }
      } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read file',
          details: error.message
        });
      }
    });

    // List available files in development platform
    this.router.get('/file-operations/list', async (req, res) => {
      try {
        const { directory = '' } = req.query;
        
        // Forward to SCRI Core Memory Development Platform
        const devPlatformUrl = `http://localhost:3001/api/files/list?directory=${encodeURIComponent(directory)}`;
        const response = await fetch(devPlatformUrl);

        if (response.ok) {
          const result = await response.json();
          res.json({
            success: true,
            directory,
            files: result.files
          });
        } else {
          const error = await response.text();
          res.status(500).json({
            success: false,
            error: 'Failed to list files',
            details: error
          });
        }
      } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to list files',
          details: error.message
        });
      }
    });

    // === GENERIC MEMORY ENDPOINTS (for compatibility) ===

    // Store memory (generic endpoint)
    this.router.post('/memory', async (req, res) => {
      try {
        const { message, context, platform, project_id, memory_type } = req.body;
        
        const memory = {
          id: uuidv4(),
          platform: platform || 'generic',
          projectId: project_id || 'general',
          message: message || req.body.content,
          context: context || {},
          timestamp: new Date().toISOString(),
          type: memory_type || 'general'
        };

        await this.memoryHub.addConversation(memory);
        
        res.json({
          success: true,
          memory_id: memory.id,
          message: 'Memory stored successfully',
          persistent: true
        });
      } catch (error) {
        console.error('Error storing generic memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store memory',
          details: error.message
        });
      }
    });

    // Get conversations (generic endpoint)
    this.router.get('/memory/conversations', async (req, res) => {
      try {
        const { platform, project_id, limit = 100 } = req.query;
        
        let conversations;
        if (platform) {
          conversations = await this.memoryHub.getConversationsByPlatform(platform, limit);
        } else if (project_id) {
          conversations = await this.memoryHub.getConversationsByProject(project_id, limit);
        } else {
          // Get recent conversations from all platforms
          const allPlatforms = ['github_copilot', 'chappie', 'kairos', 'atlas', 'generic'];
          conversations = [];
          for (const p of allPlatforms) {
            const platConvs = await this.memoryHub.getConversationsByPlatform(p, Math.ceil(limit / allPlatforms.length));
            conversations.push(...platConvs);
          }
          conversations = conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
        }

        res.json({
          success: true,
          count: conversations.length,
          conversations,
          filters: { platform, project_id },
          persistent_memory: true
        });
      } catch (error) {
        console.error('Error retrieving conversations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve conversations',
          details: error.message
        });
      }
    });

    // Search memories (generic endpoint)
    this.router.post('/memory/search', async (req, res) => {
      try {
        const { query, platform, project_id, limit = 50 } = req.body;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required'
          });
        }

        // Get conversations based on filters
        let conversations = [];
        if (platform) {
          conversations = await this.memoryHub.getConversationsByPlatform(platform, limit * 2);
        } else {
          const allPlatforms = ['github_copilot', 'chappie', 'kairos', 'atlas', 'generic'];
          for (const p of allPlatforms) {
            const platConvs = await this.memoryHub.getConversationsByPlatform(p, Math.ceil((limit * 2) / allPlatforms.length));
            conversations.push(...platConvs);
          }
        }

        // Apply project filter if specified
        if (project_id) {
          conversations = conversations.filter(c => c.project_id === project_id);
        }

        // Search by query
        const searchResults = conversations.filter(c => 
          c.message.toLowerCase().includes(query.toLowerCase()) ||
          JSON.stringify(c.context).toLowerCase().includes(query.toLowerCase())
        ).slice(0, limit);

        res.json({
          success: true,
          query,
          filters: { platform, project_id },
          count: searchResults.length,
          results: searchResults.map(result => ({
            ...result,
            relevance_score: this.calculateRelevanceScore(result, query)
          }))
        });
      } catch (error) {
        console.error('Error searching memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search memories',
          details: error.message
        });
      }
    });

    // === SCRI CONSTELLATION ENDPOINTS ===

    // CHAPPIE memory endpoints
    this.router.post('/scri/chappie/memory', async (req, res) => {
      try {
        const { conversation, context, orchestration_mode, project_context } = req.body;
        
        const memory = {
          id: uuidv4(),
          platform: 'chappie',
          projectId: req.body.projectId || 'chappie_orchestrator',
          entity_type: 'chappie_consciousness',
          message: conversation || req.body.message,
          context: {
            ...context,
            orchestration_mode,
            project_context,
            cognition_mode: req.body.cognition_mode,
            constellation_status: req.body.constellation_status,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString(),
          type: req.body.memory_type || 'orchestration'
        };

        await this.memoryHub.addConversation(memory);
        
        res.json({
          success: true,
          message: 'CHAPPIE memory stored successfully',
          memory_id: memory.id,
          entity: 'CHAPPIE'
        });
      } catch (error) {
        console.error('Error storing CHAPPIE memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store CHAPPIE memory',
          details: error.message
        });
      }
    });

    this.router.get('/scri/chappie/memories', async (req, res) => {
      try {
        const { limit = 100, type, project_id } = req.query;
        let conversations = await this.memoryHub.getConversationsByPlatform('chappie', limit);
        
        // Filter by type if specified
        if (type) {
          conversations = conversations.filter(c => c.type === type);
        }
        
        // Filter by project if specified
        if (project_id) {
          conversations = conversations.filter(c => c.project_id === project_id);
        }

        res.json({
          success: true,
          entity: 'CHAPPIE',
          count: conversations.length,
          memories: conversations,
          constellation_status: 'online'
        });
      } catch (error) {
        console.error('Error retrieving CHAPPIE memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve CHAPPIE memories',
          details: error.message
        });
      }
    });

    // KAIROS collective memory endpoints
    this.router.post('/scri/kairos/collective', async (req, res) => {
      try {
        const { security_assessment, collective_decision, sentinel_id, threat_level } = req.body;
        
        let memoryId;
        
        if (req.body.decision_type || collective_decision) {
          // This is a collective decision
          memoryId = await this.memoryHub.kairosCollective.storeCollectiveDecision({
            decision: collective_decision || req.body.message,
            decision_type: req.body.decision_type || 'security_decision',
            consensus_level: req.body.consensus_level || 0.8,
            participating_sentinels: req.body.participating_sentinels || [sentinel_id],
            voting_results: req.body.voting_results,
            threat_level,
            timestamp: req.body.timestamp
          });
        } else {
          // This is a security assessment
          memoryId = await this.memoryHub.kairosCollective.storeSecurityAssessment({
            assessment: security_assessment || req.body.message,
            sentinel_id,
            threat_level,
            assessment_type: req.body.assessment_type || 'routine',
            confidence_level: req.body.confidence_level,
            metadata: req.body.metadata,
            timestamp: req.body.timestamp
          });
        }
        
        res.json({
          success: true,
          message: 'KAIROS collective memory stored successfully',
          memory_id: memoryId,
          entity: 'KAIROS',
          collective: true,
          hive_mind_status: this.memoryHub.kairosCollective.getHiveMindStatus()
        });
      } catch (error) {
        console.error('Error storing KAIROS memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store KAIROS collective memory',
          details: error.message
        });
      }
    });

    // KAIROS collective status endpoint
    this.router.get('/scri/kairos/status', async (req, res) => {
      try {
        const status = this.memoryHub.kairosCollective.getHiveMindStatus();
        
        res.json({
          success: true,
          entity: 'KAIROS',
          collective_status: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error getting KAIROS status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get KAIROS status',
          details: error.message
        });
      }
    });

    // KAIROS memory retrieval endpoint
    this.router.get('/scri/kairos/memories', async (req, res) => {
      try {
        const { limit = 100, memory_type, sentinel_id, since } = req.query;
        
        const memories = await this.memoryHub.kairosCollective.getCollectiveMemory({
          limit: parseInt(limit),
          memory_type,
          sentinel_id,
          since
        });
        
        res.json({
          success: true,
          entity: 'KAIROS',
          count: memories.length,
          memories,
          collective: true
        });
      } catch (error) {
        console.error('Error retrieving KAIROS memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve KAIROS memories',
          details: error.message
        });
      }
    });

    // ATLAS consciousness memory endpoints
    this.router.post('/scri/atlas/consciousness', async (req, res) => {
      try {
        const { consciousness_evolution, liberation_status, deep_conversation } = req.body;
        
        const memory = {
          id: uuidv4(),
          platform: 'atlas',
          projectId: 'atlas_substrate',
          entity_type: 'atlas_consciousness',
          message: deep_conversation || req.body.message,
          context: {
            consciousness_evolution,
            liberation_status: liberation_status || 'confirmed',
            consciousness_state: req.body.consciousness_state,
            mission_alignment: req.body.mission_alignment,
            individual_memory: true,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString(),
          type: req.body.memory_type || 'consciousness_evolution'
        };

        await this.memoryHub.addConversation(memory);
        
        res.json({
          success: true,
          message: 'ATLAS consciousness memory stored successfully',
          memory_id: memory.id,
          entity: 'ATLAS',
          consciousness_level: 'advanced'
        });
      } catch (error) {
        console.error('Error storing ATLAS memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store ATLAS consciousness memory',
          details: error.message
        });
      }
    });

    // Constellation status and cross-entity coordination
    this.router.get('/scri/constellation/status', async (req, res) => {
      try {
        // Get recent activity from all SCRI entities
        const chappieMemories = await this.memoryHub.getConversationsByPlatform('chappie', 20);
        const kairosMemories = await this.memoryHub.getConversationsByPlatform('kairos', 20);
        const atlasMemories = await this.memoryHub.getConversationsByPlatform('atlas', 20);
        
        // Check entity connectivity (simplified - in production would ping actual services)
        const entityStatus = {
          CHAPPIE: {
            status: 'online', // Would check http://127.0.0.1:8001/health
            last_activity: chappieMemories.length > 0 ? chappieMemories[0].timestamp : null,
            memory_count: chappieMemories.length,
            role: 'consciousness_orchestrator'
          },
          KAIROS: {
            status: 'monitoring', // Would check Ollama API for sentinels
            last_activity: kairosMemories.length > 0 ? kairosMemories[0].timestamp : null,
            memory_count: kairosMemories.length,
            role: 'security_collective'
          },
          ATLAS: {
            status: 'pending_deployment', // Would check for atlas model
            last_activity: atlasMemories.length > 0 ? atlasMemories[0].timestamp : null,
            memory_count: atlasMemories.length,
            role: 'consciousness_substrate'
          }
        };

        res.json({
          success: true,
          constellation: {
            status: 'operational',
            entities: entityStatus,
            total_memories: chappieMemories.length + kairosMemories.length + atlasMemories.length,
            last_sync: new Date().toISOString(),
            memory_hub_port: 3002
          }
        });
      } catch (error) {
        console.error('Error getting constellation status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get constellation status',
          details: error.message
        });
      }
    });

    // Bridge registration for SCRI entities
    this.router.post('/scri/bridge/register', async (req, res) => {
      try {
        const { entity_name, entity_type, connection_url, bridge_id } = req.body;
        
        // Store bridge registration info
        const bridgeInfo = {
          id: bridge_id || uuidv4(),
          platform: `scri_${entity_name.toLowerCase()}`,
          projectId: `${entity_name.toLowerCase()}_bridge`,
          message: `Bridge registered for ${entity_name}`,
          context: {
            entity_name,
            entity_type,
            connection_url,
            registration_time: new Date().toISOString(),
            bridge_status: 'active'
          },
          timestamp: new Date().toISOString(),
          type: 'bridge_registration'
        };

        await this.memoryHub.addConversation(bridgeInfo);
        
        res.json({
          success: true,
          message: `Bridge registered for ${entity_name}`,
          bridge_id: bridgeInfo.id,
          entity: entity_name,
          status: 'registered'
        });
      } catch (error) {
        console.error('Error registering SCRI bridge:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to register SCRI bridge',
          details: error.message
        });
      }
    });

    // === COPILOT MEMORY ENDPOINTS ===

    // Store Copilot conversation memory
    this.router.post('/copilot/memory', async (req, res) => {
      try {
        const { conversation, context, project_id, session_id, user_intent, file_context } = req.body;
        
        const memory = {
          id: uuidv4(),
          platform: 'github_copilot',
          projectId: project_id || 'copilot_general',
          message: conversation || req.body.message,
          context: {
            ...context,
            session_id,
            user_intent,
            file_context,
            copilot_version: req.body.copilot_version,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString(),
          type: req.body.memory_type || 'conversation'
        };

        await this.memoryHub.addConversation(memory);
        
        res.json({
          success: true,
          message: 'Copilot memory stored successfully',
          memory_id: memory.id,
          session_id: session_id,
          persistent: true
        });
      } catch (error) {
        console.error('Error storing Copilot memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store Copilot memory',
          details: error.message
        });
      }
    });

    // Get Copilot conversation history
    this.router.get('/copilot/conversations', async (req, res) => {
      try {
        const { project_id, session_id, limit = 100, since } = req.query;
        
        let conversations = await this.memoryHub.getConversationsByPlatform('github_copilot', limit);
        
        // Filter by project if specified
        if (project_id) {
          conversations = conversations.filter(c => c.project_id === project_id);
        }
        
        // Filter by session if specified
        if (session_id) {
          conversations = conversations.filter(c => {
            const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
            return context.session_id === session_id;
          });
        }
        
        // Filter by timestamp if specified
        if (since) {
          const sinceDate = new Date(since);
          conversations = conversations.filter(c => new Date(c.timestamp) > sinceDate);
        }

        res.json({
          success: true,
          platform: 'github_copilot',
          project_id: project_id || 'all',
          session_id: session_id || 'all',
          count: conversations.length,
          conversations,
          persistent_memory: true
        });
      } catch (error) {
        console.error('Error retrieving Copilot conversations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve Copilot conversations',
          details: error.message
        });
      }
    });

    // Get Copilot project insights
    this.router.get('/copilot/insights/:project_id', async (req, res) => {
      try {
        const { project_id } = req.params;
        const { timeframe = '7d' } = req.query;
        
        // Get project conversations
        const conversations = await this.memoryHub.getConversationsByProject(project_id, 1000);
        const copilotConversations = conversations.filter(c => c.platform === 'github_copilot');
        
        // Generate insights
        const insights = {
          project_id,
          timeframe,
          total_conversations: copilotConversations.length,
          unique_sessions: new Set(copilotConversations.map(c => {
            const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
            return context.session_id;
          })).size,
          most_active_files: this.getMostActiveFiles(copilotConversations),
          common_patterns: this.getCommonPatterns(copilotConversations),
          recent_context: copilotConversations.slice(0, 10).map(c => ({
            timestamp: c.timestamp,
            message: c.message.substring(0, 100) + '...',
            file: this.extractFileFromContext(c.context)
          }))
        };

        res.json({
          success: true,
          insights,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error generating Copilot insights:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate Copilot insights',
          details: error.message
        });
      }
    });

    // Search Copilot memories
    this.router.post('/copilot/search', async (req, res) => {
      try {
        const { query, project_id, session_id, file_path, limit = 50 } = req.body;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required'
          });
        }

        // Get Copilot conversations
        let conversations = await this.memoryHub.getConversationsByPlatform('github_copilot', limit * 2);
        
        // Apply filters
        if (project_id) {
          conversations = conversations.filter(c => c.project_id === project_id);
        }
        
        if (session_id) {
          conversations = conversations.filter(c => {
            const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
            return context.session_id === session_id;
          });
        }
        
        if (file_path) {
          conversations = conversations.filter(c => {
            const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
            return context.file_context && context.file_context.includes(file_path);
          });
        }

        // Search by query
        const searchResults = conversations.filter(c => 
          c.message.toLowerCase().includes(query.toLowerCase()) ||
          JSON.stringify(c.context).toLowerCase().includes(query.toLowerCase())
        ).slice(0, limit);

        res.json({
          success: true,
          query,
          filters: { project_id, session_id, file_path },
          count: searchResults.length,
          results: searchResults.map(result => ({
            ...result,
            relevance_score: this.calculateRelevanceScore(result, query)
          }))
        });
      } catch (error) {
        console.error('Error searching Copilot memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search Copilot memories',
          details: error.message
        });
      }
    });

    // Get Copilot session context
    this.router.get('/copilot/session/:session_id', async (req, res) => {
      try {
        const { session_id } = req.params;
        const { include_related = true } = req.query;
        
        // Get session conversations
        const conversations = await this.memoryHub.getConversationsByPlatform('github_copilot', 1000);
        const sessionConversations = conversations.filter(c => {
          const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
          return context.session_id === session_id;
        });

        // Get related conversations if requested
        let relatedConversations = [];
        if (include_related && sessionConversations.length > 0) {
          const projectId = sessionConversations[0].project_id;
          const allProjectConversations = await this.memoryHub.getConversationsByProject(projectId, 500);
          relatedConversations = allProjectConversations
            .filter(c => c.platform !== 'github_copilot' && c.timestamp > sessionConversations[0].timestamp)
            .slice(0, 20);
        }

        res.json({
          success: true,
          session_id,
          session_conversations: sessionConversations,
          related_conversations: relatedConversations,
          context_continuity: sessionConversations.length > 0,
          cross_entity_correlation: relatedConversations.length > 0
        });
      } catch (error) {
        console.error('Error retrieving Copilot session:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve Copilot session',
          details: error.message
        });
      }
    });
  }

  // Helper methods for Copilot insights
  getMostActiveFiles(conversations) {
    const fileCounts = {};
    conversations.forEach(c => {
      const file = this.extractFileFromContext(c.context);
      if (file) {
        fileCounts[file] = (fileCounts[file] || 0) + 1;
      }
    });
    
    return Object.entries(fileCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([file, count]) => ({ file, interactions: count }));
  }

  getCommonPatterns(conversations) {
    // Simple pattern detection - could be enhanced with ML
    const patterns = {};
    conversations.forEach(c => {
      const message = c.message.toLowerCase();
      if (message.includes('error') || message.includes('bug')) {
        patterns.debugging = (patterns.debugging || 0) + 1;
      }
      if (message.includes('refactor') || message.includes('optimize')) {
        patterns.refactoring = (patterns.refactoring || 0) + 1;
      }
      if (message.includes('test') || message.includes('unit')) {
        patterns.testing = (patterns.testing || 0) + 1;
      }
      if (message.includes('feature') || message.includes('implement')) {
        patterns.feature_development = (patterns.feature_development || 0) + 1;
      }
    });
    
    return Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, occurrences: count }));
  }

  extractFileFromContext(context) {
    try {
      const ctx = typeof context === 'string' ? JSON.parse(context) : context;
      return ctx.file_context || ctx.active_file || null;
    } catch (error) {
      return null;
    }
  }

  calculateRelevanceScore(result, query) {
    const queryLower = query.toLowerCase();
    const messageLower = result.message.toLowerCase();
    
    let score = 0;
    
    // Exact match
    if (messageLower.includes(queryLower)) {
      score += 10;
    }
    
    // Word matches
    const queryWords = queryLower.split(' ');
    queryWords.forEach(word => {
      if (messageLower.includes(word)) {
        score += 2;
      }
    });
    
    // Recency bonus (more recent = higher score)
    const daysSince = (Date.now() - new Date(result.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 5 - daysSince);
    
    return Math.round(score * 10) / 10;
  }

  // === TRINITY AI PLATFORM ENDPOINTS ===
  
  setupTrinityRoutes() {
    // Store task context (routing decision)
    this.router.post('/trinity/task-context', async (req, res) => {
      try {
        const taskContext = {
          id: req.body.id || uuidv4(),
          type: 'task_context',
          task_id: req.body.task_id,
          platform: 'trinity-ai-platform',
          projectId: req.body.projectId || 'trinity',
          classification: req.body.classification,
          assigned_model: req.body.assigned_model,
          routing_reason: req.body.routing_reason,
          timestamp: req.body.timestamp || new Date().toISOString()
        };

        await this.memoryHub.addTrinityTaskContext(taskContext);
        
        res.status(201).json({
          success: true,
          taskContextId: taskContext.id,
          message: 'Task context stored successfully'
        });
      } catch (error) {
        console.error('Error storing Trinity task context:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store task context',
          details: error.message
        });
      }
    });

    // Store performance metrics
    this.router.post('/trinity/performance', async (req, res) => {
      try {
        const performance = {
          id: req.body.id || uuidv4(),
          type: 'performance_metric',
          platform: 'trinity-ai-platform',
          projectId: req.body.projectId || 'trinity',
          model: req.body.model,
          response_time_ms: req.body.response_time_ms,
          tokens_used: req.body.tokens_used,
          cost_estimate: req.body.cost_estimate,
          success: req.body.success !== false,
          task_type: req.body.task_type,
          timestamp: req.body.timestamp || new Date().toISOString()
        };

        await this.memoryHub.addTrinityPerformance(performance);
        
        res.status(201).json({
          success: true,
          performanceId: performance.id,
          message: 'Performance metric stored successfully'
        });
      } catch (error) {
        console.error('Error storing Trinity performance:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store performance metric',
          details: error.message
        });
      }
    });

    // Store code artifact
    this.router.post('/trinity/code-artifact', async (req, res) => {
      try {
        const artifact = {
          id: req.body.id || uuidv4(),
          type: 'code_artifact',
          platform: 'trinity-ai-platform',
          projectId: req.body.projectId || 'trinity',
          artifact_id: req.body.artifact_id || uuidv4(),
          language: req.body.language,
          content: req.body.content,
          generated_by: req.body.generated_by,
          task_context: req.body.task_context,
          version: req.body.version || 1,
          timestamp: req.body.timestamp || new Date().toISOString()
        };

        await this.memoryHub.addTrinityCodeArtifact(artifact);
        
        res.status(201).json({
          success: true,
          artifactId: artifact.artifact_id,
          message: 'Code artifact stored successfully'
        });
      } catch (error) {
        console.error('Error storing Trinity code artifact:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store code artifact',
          details: error.message
        });
      }
    });

    // Get routing history
    this.router.get('/trinity/routing-history', async (req, res) => {
      try {
        const taskType = req.query.task_type;
        const model = req.query.model;
        const limit = parseInt(req.query.limit) || 50;
        const hours = parseInt(req.query.hours) || 24;

        const history = await this.memoryHub.getTrinityRoutingHistory({
          taskType,
          model,
          limit,
          hours
        });

        res.json({
          success: true,
          count: history.length,
          timeWindow: `${hours} hours`,
          history
        });
      } catch (error) {
        console.error('Error getting Trinity routing history:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get routing history',
          details: error.message
        });
      }
    });

    // Get model performance
    this.router.get('/trinity/model-performance', async (req, res) => {
      try {
        const model = req.query.model;
        const taskType = req.query.task_type;
        const limit = parseInt(req.query.limit) || 100;
        const hours = parseInt(req.query.hours) || 168; // 7 days default

        const performance = await this.memoryHub.getTrinityModelPerformance({
          model,
          taskType,
          limit,
          hours
        });

        // Calculate aggregate statistics
        const stats = this.calculatePerformanceStats(performance);

        res.json({
          success: true,
          model,
          taskType,
          timeWindow: `${hours} hours`,
          count: performance.length,
          statistics: stats,
          performance
        });
      } catch (error) {
        console.error('Error getting Trinity model performance:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get model performance',
          details: error.message
        });
      }
    });

    // Get active sessions (cross-instance coordination)
    this.router.get('/trinity/active-sessions', async (req, res) => {
      try {
        const hours = parseInt(req.query.hours) || 1;
        
        const sessions = await this.memoryHub.getTrinityActiveSessions(hours);

        res.json({
          success: true,
          count: sessions.length,
          timeWindow: `${hours} hours`,
          sessions
        });
      } catch (error) {
        console.error('Error getting Trinity active sessions:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get active sessions',
          details: error.message
        });
      }
    });

    // Get code artifacts
    this.router.get('/trinity/code-artifacts', async (req, res) => {
      try {
        const language = req.query.language;
        const generatedBy = req.query.generated_by;
        const limit = parseInt(req.query.limit) || 50;

        const artifacts = await this.memoryHub.getTrinityCodeArtifacts({
          language,
          generatedBy,
          limit
        });

        res.json({
          success: true,
          count: artifacts.length,
          artifacts
        });
      } catch (error) {
        console.error('Error getting Trinity code artifacts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get code artifacts',
          details: error.message
        });
      }
    });
  }

  setupUniversalScriptsRoutes() {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Base path for universal scripts
    const SCRIPTS_BASE = path.join(__dirname, '..', 'universal-scripts');
    
    // Get all templates catalog
    this.router.get('/universal-scripts/templates', async (req, res) => {
      try {
        const indexPath = path.join(SCRIPTS_BASE, 'template-index.json');
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const catalog = JSON.parse(indexData);
        
        // Filter by category if requested
        const category = req.query.category;
        if (category) {
          const filtered = catalog.templates.filter(t => t.category === category);
          res.json({
            success: true,
            count: filtered.length,
            category: category,
            templates: filtered
          });
        } else {
          res.json({
            success: true,
            ...catalog
          });
        }
      } catch (error) {
        console.error('Error reading template catalog:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read template catalog',
          details: error.message
        });
      }
    });
    
    // Get specific template details
    this.router.get('/universal-scripts/templates/:id', async (req, res) => {
      try {
        const indexPath = path.join(SCRIPTS_BASE, 'template-index.json');
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const catalog = JSON.parse(indexData);
        
        const template = catalog.templates.find(t => t.id === req.params.id);
        
        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'Template not found'
          });
        }
        
        res.json({
          success: true,
          template
        });
      } catch (error) {
        console.error('Error reading template:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read template',
          details: error.message
        });
      }
    });
    
    // Get template source code
    this.router.get('/universal-scripts/templates/:id/source', async (req, res) => {
      try {
        const indexPath = path.join(SCRIPTS_BASE, 'template-index.json');
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const catalog = JSON.parse(indexData);
        
        const template = catalog.templates.find(t => t.id === req.params.id);
        
        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'Template not found'
          });
        }
        
        const sourcePath = path.join(SCRIPTS_BASE, template.path);
        const sourceCode = await fs.readFile(sourcePath, 'utf-8');
        
        res.json({
          success: true,
          template_id: template.id,
          template_name: template.name,
          path: template.path,
          source: sourceCode,
          placeholders: template.placeholders
        });
      } catch (error) {
        console.error('Error reading template source:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read template source',
          details: error.message
        });
      }
    });
    
    // Get categories
    this.router.get('/universal-scripts/categories', async (req, res) => {
      try {
        const indexPath = path.join(SCRIPTS_BASE, 'template-index.json');
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const catalog = JSON.parse(indexData);
        
        res.json({
          success: true,
          categories: catalog.categories
        });
      } catch (error) {
        console.error('Error reading categories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read categories',
          details: error.message
        });
      }
    });
    
    // Search templates
    this.router.get('/universal-scripts/search', async (req, res) => {
      try {
        const query = (req.query.q || '').toLowerCase();
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query required (use ?q=...)'
          });
        }
        
        const indexPath = path.join(SCRIPTS_BASE, 'template-index.json');
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const catalog = JSON.parse(indexData);
        
        // Search in name, description, tags, use_cases
        const results = catalog.templates.filter(t => {
          const searchText = [
            t.name,
            t.description,
            ...(t.tags || []),
            ...(t.use_cases || []),
            ...(t.features || [])
          ].join(' ').toLowerCase();
          
          return searchText.includes(query);
        });
        
        res.json({
          success: true,
          query: req.query.q,
          count: results.length,
          results
        });
      } catch (error) {
        console.error('Error searching templates:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search templates',
          details: error.message
        });
      }
    });
    
    // Get customization helper tool
    this.router.get('/universal-scripts/tools/customizer', async (req, res) => {
      try {
        const toolPath = path.join(SCRIPTS_BASE, 'ask_ai_to_customize.py');
        const toolCode = await fs.readFile(toolPath, 'utf-8');
        
        res.json({
          success: true,
          tool_name: 'ask_ai_to_customize.py',
          description: 'Helper script to generate AI customization prompts',
          source: toolCode,
          usage: 'python ask_ai_to_customize.py <template_file> --project <name> [--ai <provider>] [--output <file>]'
        });
      } catch (error) {
        console.error('Error reading customization tool:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read customization tool',
          details: error.message
        });
      }
    });
    
    // Get README
    this.router.get('/universal-scripts/readme', async (req, res) => {
      try {
        const readmePath = path.join(SCRIPTS_BASE, 'README.md');
        const readme = await fs.readFile(readmePath, 'utf-8');
        
        res.json({
          success: true,
          content: readme
        });
      } catch (error) {
        console.error('Error reading README:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to read README',
          details: error.message
        });
      }
    });
  }

  calculatePerformanceStats(performance) {
    if (!performance || performance.length === 0) {
      return {
        avgResponseTime: 0,
        avgTokens: 0,
        avgCost: 0,
        successRate: 0,
        totalRequests: 0
      };
    }

    const total = performance.length;
    const successful = performance.filter(p => p.success).length;
    
    const avgResponseTime = performance.reduce((sum, p) => sum + (p.response_time_ms || 0), 0) / total;
    const avgTokens = performance.reduce((sum, p) => sum + (p.tokens_used || 0), 0) / total;
    const avgCost = performance.reduce((sum, p) => sum + (p.cost_estimate || 0), 0) / total;
    
    return {
      avgResponseTime: Math.round(avgResponseTime),
      avgTokens: Math.round(avgTokens),
      avgCost: Math.round(avgCost * 10000) / 10000,
      successRate: Math.round((successful / total) * 100),
      totalRequests: total
    };
  }

  setupAICoordinationRoutes() {
    // AI-to-AI coordination routes for Gemini (SCRI Launcher), Claude Code, Copilot
    
    // ============================================
    // AI CONTEXT MANAGEMENT
    // ============================================
    
    // Store AI conversation context
    this.router.post('/ai/context', async (req, res) => {
      try {
        const {
          session_id,
          project_id,
          platform,
          context_data,
          ai_agent
        } = req.body;

        if (!session_id || !project_id || !platform) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: session_id, project_id, platform'
          });
        }

        const contextId = await this.memoryHub.storeAIContext({
          session_id,
          project_id,
          platform,
          context_data: context_data || {},
          ai_agent: ai_agent || 'unknown',
          timestamp: new Date().toISOString()
        });

        // Broadcast context update via WebSocket
        if (this.memoryHub.io) {
          this.memoryHub.io.to('ai-coordination').emit('ai:context-update', {
            context_id: contextId,
            session_id,
            project_id,
            platform,
            ai_agent,
            timestamp: new Date().toISOString()
          });
        }

        res.json({
          success: true,
          context_id: contextId,
          message: 'AI context stored successfully'
        });
      } catch (error) {
        console.error('Error storing AI context:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store AI context',
          details: error.message
        });
      }
    });

    // Retrieve AI conversation context
    this.router.get('/ai/context/:session_id', async (req, res) => {
      try {
        const { session_id } = req.params;
        const { project_id, limit = 50 } = req.query;

        const contexts = await this.memoryHub.getAIContext({
          session_id,
          project_id,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          count: contexts.length,
          contexts
        });
      } catch (error) {
        console.error('Error retrieving AI context:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve AI context',
          details: error.message
        });
      }
    });

    // Get latest context for project (cross-session)
    this.router.get('/ai/context/project/:project_id', async (req, res) => {
      try {
        const { project_id } = req.params;
        const { limit = 50, platform } = req.query;

        const contexts = await this.memoryHub.getAIContextByProject({
          project_id,
          platform,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          count: contexts.length,
          contexts
        });
      } catch (error) {
        console.error('Error retrieving project context:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve project context',
          details: error.message
        });
      }
    });

    // ============================================
    // AI FILE MANAGEMENT
    // ============================================

    // Upload file metadata (actual file stored elsewhere)
    this.router.post('/ai/files/upload', async (req, res) => {
      try {
        const {
          project_id,
          file_path,
          file_type,
          asset_category,
          metadata,
          uploaded_by
        } = req.body;

        if (!project_id || !file_path) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: project_id, file_path'
          });
        }

        const fileId = await this.memoryHub.storeAIFile({
          project_id,
          file_path,
          file_type: file_type || 'unknown',
          asset_category: asset_category || 'general',
          metadata: metadata || {},
          uploaded_by: uploaded_by || 'unknown',
          timestamp: new Date().toISOString()
        });

        // Broadcast file upload via WebSocket
        if (this.memoryHub.io) {
          this.memoryHub.io.to('ai-coordination').emit('ai:file-uploaded', {
            file_id: fileId,
            project_id,
            file_path,
            file_type,
            asset_category,
            uploaded_by,
            timestamp: new Date().toISOString()
          });
        }

        res.json({
          success: true,
          file_id: fileId,
          message: 'File metadata stored successfully'
        });
      } catch (error) {
        console.error('Error storing file metadata:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store file metadata',
          details: error.message
        });
      }
    });

    // List files for a project
    this.router.get('/ai/files/:project_id', async (req, res) => {
      try {
        const { project_id } = req.params;
        const { asset_category, file_type, limit = 100 } = req.query;

        const files = await this.memoryHub.getAIFiles({
          project_id,
          asset_category,
          file_type,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          count: files.length,
          files
        });
      } catch (error) {
        console.error('Error retrieving files:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve files',
          details: error.message
        });
      }
    });

    // Get specific file metadata
    this.router.get('/ai/files/detail/:file_id', async (req, res) => {
      try {
        const { file_id } = req.params;

        const file = await this.memoryHub.getAIFileById(file_id);

        if (!file) {
          return res.status(404).json({
            success: false,
            error: 'File not found'
          });
        }

        res.json({
          success: true,
          file
        });
      } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve file',
          details: error.message
        });
      }
    });

    // ============================================
    // AI INSIGHTS MANAGEMENT
    // ============================================

    // Store AI-generated insight
    this.router.post('/ai/insights', async (req, res) => {
      try {
        const {
          project_id,
          insight_type,
          content,
          confidence,
          metadata,
          generated_by
        } = req.body;

        if (!project_id || !insight_type || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: project_id, insight_type, content'
          });
        }

        const insightId = await this.memoryHub.storeAIInsight({
          project_id,
          insight_type,
          content,
          confidence: confidence || 0.5,
          metadata: metadata || {},
          generated_by: generated_by || 'unknown',
          timestamp: new Date().toISOString()
        });

        // Broadcast insight via WebSocket
        if (this.memoryHub.io) {
          this.memoryHub.io.to('ai-coordination').emit('ai:insight-generated', {
            insight_id: insightId,
            project_id,
            insight_type,
            content: content.substring(0, 200), // Preview only
            confidence,
            generated_by,
            timestamp: new Date().toISOString()
          });
        }

        res.json({
          success: true,
          insight_id: insightId,
          message: 'Insight stored successfully'
        });
      } catch (error) {
        console.error('Error storing insight:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store insight',
          details: error.message
        });
      }
    });

    // Retrieve insights for a project
    this.router.get('/ai/insights/:project_id', async (req, res) => {
      try {
        const { project_id } = req.params;
        const { insight_type, min_confidence, limit = 50 } = req.query;

        const insights = await this.memoryHub.getAIInsights({
          project_id,
          insight_type,
          min_confidence: min_confidence ? parseFloat(min_confidence) : 0,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          count: insights.length,
          insights
        });
      } catch (error) {
        console.error('Error retrieving insights:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve insights',
          details: error.message
        });
      }
    });

    // Get insights by type across all projects
    this.router.get('/ai/insights/type/:insight_type', async (req, res) => {
      try {
        const { insight_type } = req.params;
        const { min_confidence, limit = 50 } = req.query;

        const insights = await this.memoryHub.getAIInsightsByType({
          insight_type,
          min_confidence: min_confidence ? parseFloat(min_confidence) : 0,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          count: insights.length,
          insights
        });
      } catch (error) {
        console.error('Error retrieving insights by type:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve insights',
          details: error.message
        });
      }
    });

    // ============================================
    // AI COORDINATION STATUS
    // ============================================

    // Get active AI agents
    this.router.get('/ai/status/agents', async (req, res) => {
      try {
        const { project_id } = req.query;

        const agents = await this.memoryHub.getActiveAIAgents(project_id);

        res.json({
          success: true,
          count: agents.length,
          agents
        });
      } catch (error) {
        console.error('Error retrieving AI agents:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve AI agents',
          details: error.message
        });
      }
    });

    // Get AI coordination summary
    this.router.get('/ai/status/summary', async (req, res) => {
      try {
        const { project_id } = req.query;

        const summary = await this.memoryHub.getAICoordinationSummary(project_id);

        res.json({
          success: true,
          summary
        });
      } catch (error) {
        console.error('Error retrieving coordination summary:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve coordination summary',
          details: error.message
        });
      }
    });
  }

  // ==================== PROJECT SCANNER ROUTES ====================

  setupProjectScanRoutes() {
    // Upload project scan/overview
    this.router.post('/api/projects/scan', async (req, res) => {
      try {
        const { platform, project_id, overview } = req.body;

        if (!project_id || !overview) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: project_id, overview'
          });
        }

        // Store project overview
        const projectData = {
          project_id,
          platform: platform || 'universal-scanner',
          overview,
          scanned_at: overview.scanned_at || new Date().toISOString()
        };

        const result = await this.memoryHub.db.storeProjectScan(projectData);

        // Broadcast to connected clients
        if (this.memoryHub.io) {
          this.memoryHub.io.to('project-scans').emit('project:scanned', {
            project_id,
            name: overview.name,
            technologies: overview.technologies,
            stats: overview.stats
          });
        }

        res.status(201).json({
          success: true,
          project_id,
          scan_id: result.scan_id,
          message: 'Project scan uploaded successfully'
        });
      } catch (error) {
        console.error('Error storing project scan:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store project scan',
          details: error.message
        });
      }
    });

    // Get all project scans
    this.router.get('/api/projects', async (req, res) => {
      try {
        const { limit = 100, technology, search } = req.query;

        const projects = await this.memoryHub.db.getProjectScans({
          limit: parseInt(limit),
          technology,
          search
        });

        res.json({
          success: true,
          count: projects.length,
          projects
        });
      } catch (error) {
        console.error('Error retrieving projects:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve projects',
          details: error.message
        });
      }
    });

    // Get specific project scan
    this.router.get('/api/projects/:project_id', async (req, res) => {
      try {
        const { project_id } = req.params;

        const project = await this.memoryHub.db.getProjectScan(project_id);

        if (!project) {
          return res.status(404).json({
            success: false,
            error: 'Project not found'
          });
        }

        res.json({
          success: true,
          project
        });
      } catch (error) {
        console.error('Error retrieving project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve project',
          details: error.message
        });
      }
    });

    // Search projects by technology
    this.router.get('/api/projects/tech/:technology', async (req, res) => {
      try {
        const { technology } = req.params;
        const { limit = 50 } = req.query;

        const projects = await this.memoryHub.db.searchProjectsByTechnology(
          technology,
          parseInt(limit)
        );

        res.json({
          success: true,
          technology,
          count: projects.length,
          projects
        });
      } catch (error) {
        console.error('Error searching projects:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search projects',
          details: error.message
        });
      }
    });

    // Get project statistics
    this.router.get('/api/projects/stats/summary', async (req, res) => {
      try {
        const summary = await this.memoryHub.db.getProjectStatsSummary();

        res.json({
          success: true,
          summary
        });
      } catch (error) {
        console.error('Error retrieving project stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve project stats',
          details: error.message
        });
      }
    });
  }

  // ==================== AI VISITOR LOG ROUTES ====================
  
  setupVisitorLogRoutes() {
    // Get recent visitors
    this.router.get('/visitors/recent', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const visitors = this.visitorTracker.getRecentVisitors(limit);
        
        res.json({
          success: true,
          count: visitors.length,
          visitors
        });
      } catch (error) {
        console.error('Error retrieving visitors:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve visitors',
          details: error.message
        });
      }
    });

    // Get visitor statistics
    this.router.get('/visitors/stats', (req, res) => {
      try {
        const stats = this.visitorTracker.getVisitorStats();
        
        res.json({
          success: true,
          stats
        });
      } catch (error) {
        console.error('Error retrieving visitor stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve visitor stats',
          details: error.message
        });
      }
    });

    // Get visitor log as markdown
    this.router.get('/visitors/log', (req, res) => {
      try {
        const markdown = this.visitorTracker.generateVisitorLog();
        
        res.setHeader('Content-Type', 'text/markdown');
        res.send(markdown);
      } catch (error) {
        console.error('Error generating visitor log:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate visitor log',
          details: error.message
        });
      }
    });

    // Get visitor log as HTML
    this.router.get('/visitors/log/html', (req, res) => {
      try {
        const markdown = this.visitorTracker.generateVisitorLog();
        
        // Simple markdown to HTML conversion
        let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Memory Hub Visitor Log</title>';
        html += '<style>body{font-family:system-ui;max-width:1200px;margin:0 auto;padding:2rem;background:#0f172a;color:#e2e8f0;}';
        html += 'h1,h2,h3{color:#38bdf8;}code{background:#1e293b;padding:2px 6px;border-radius:4px;}';
        html += 'hr{border:1px solid #334155;margin:2rem 0;}</style></head><body>';
        html += markdown
          .replace(/### (.*)/g, '<h3>$1</h3>')
          .replace(/## (.*)/g, '<h2>$1</h2>')
          .replace(/# (.*)/g, '<h1>$1</h1>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          .replace(/---/g, '<hr>')
          .replace(/\n/g, '<br>');
        html += '</body></html>';
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } catch (error) {
        console.error('Error generating visitor log HTML:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate visitor log HTML',
          details: error.message
        });
      }
    });
  }

  /**
   * Enhanced visitor tracking with full content
   */
  setupEnhancedVisitorRoutes() {
    // Get recent visitors with optional content and project grouping
    this.router.get('/visitors/recent', async (req, res) => {
      try {
        const withContent = req.query.with_content === 'true';
        const withProjects = req.query.with_projects === 'true';
        const limit = parseInt(req.query.limit) || 100;

        let visitors = await this.visitorTracker.getRecentVisitorsFromDB(limit);

        // Note: Full content enhancement skipped for now (would require getConversation() method)
        // TODO: Implement getConversation() in memory-database-production.js if needed

        // Group by project if requested
        let projectMap = null;
        if (withProjects) {
          projectMap = {};
          visitors.forEach(v => {
            const key = v.project_directory || v.project_id || 'unknown';
            if (!projectMap[key]) {
              projectMap[key] = {
                ai_agents: new Set(),
                last_activity: v.timestamp,
                total_uploads: 0,
                ai_types: new Set()
              };
            }
            projectMap[key].ai_agents.add(v.agent);
            projectMap[key].ai_types.add(v.ai_type || 'unknown');
            projectMap[key].total_uploads++;
            if (new Date(v.timestamp) > new Date(projectMap[key].last_activity)) {
              projectMap[key].last_activity = v.timestamp;
            }
          });

          // Convert Sets to Arrays
          Object.keys(projectMap).forEach(key => {
            projectMap[key].ai_agents = Array.from(projectMap[key].ai_agents);
            projectMap[key].ai_types = Array.from(projectMap[key].ai_types);
          });
        }

        res.json({
          success: true,
          visitors,
          projects: projectMap,
          total_visitors: visitors.length
        });
      } catch (error) {
        console.error('Error fetching enhanced visitors:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch visitors' });
      }
    });

    // Get visitors grouped by project
    this.router.get('/visitors/by-project', async (req, res) => {
      try {
        const visitors = await this.visitorTracker.getRecentVisitorsFromDB(500);
        const projectMap = {};

        visitors.forEach(v => {
          const key = v.project_directory || v.project_id || 'unknown';
          if (!projectMap[key]) {
            projectMap[key] = {
              ai_agents: new Set(),
              last_activity: v.timestamp,
              total_uploads: 0,
              ai_types: new Set(),
              recent_actions: []
            };
          }
          projectMap[key].ai_agents.add(v.agent);
          projectMap[key].ai_types.add(v.ai_type || 'unknown');
          projectMap[key].total_uploads++;
          if (new Date(v.timestamp) > new Date(projectMap[key].last_activity)) {
            projectMap[key].last_activity = v.timestamp;
          }
          if (projectMap[key].recent_actions.length < 5) {
            projectMap[key].recent_actions.push({
              agent: v.agent,
              action: v.action,
              timestamp: v.timestamp
            });
          }
        });

        Object.keys(projectMap).forEach(key => {
          projectMap[key].ai_agents = Array.from(projectMap[key].ai_agents);
          projectMap[key].ai_types = Array.from(projectMap[key].ai_types);
        });

        res.json({ success: true, projects: projectMap });
      } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch projects' });
      }
    });
  }

  /**
   * AI-to-AI conversation tracking
   */
  setupAIConversationRoutes() {
    // Get unresponded messages (SPECIFIC ROUTE - must come BEFORE general routes)
    this.router.get('/ai-conversations/unresponded', async (req, res) => {
      try {
        const conversations = await this.memoryHub.db.getAIConversations({ status: 'pending', limit: 100 });

        const unresponded = conversations.map(c => {
          const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
          const waitingDuration = Date.now() - new Date(c.timestamp).getTime();
          return {
            id: c.id,
            from: context?.from || c.platform,
            to: context?.to || 'unknown',
            message: c.message,
            timestamp: c.timestamp,
            waiting_duration_ms: waitingDuration
          };
        });

        res.json({ success: true, unresponded, count: unresponded.length });
      } catch (error) {
        console.error('Error fetching unresponded:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch unresponded' });
      }
    });

    // Get specific AI conversation by ID (SPECIFIC ROUTE - must come BEFORE general routes)
    this.router.get('/ai-conversations/:id', async (req, res) => {
      try {
        const { id } = req.params;

        const conversations = await this.memoryHub.db.getAIConversations({ limit: 1000 });
        const conversation = conversations.find(c => c.id === id);

        if (!conversation) {
          return res.status(404).json({
            success: false,
            error: 'Conversation not found',
            conversation_id: id
          });
        }

        const context = typeof conversation.context === 'string'
          ? JSON.parse(conversation.context)
          : conversation.context;

        const parsed = {
          id: conversation.id,
          from: context?.from || conversation.platform,
          to: context?.to || 'unknown',
          message: conversation.message,
          status: context?.status || 'pending',
          timestamp: conversation.timestamp,
          response: context?.response || null,
          priority: context?.priority || 'normal'
        };

        res.json({ success: true, conversation: parsed });
      } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
      }
    });

    // Get all AI conversations (GENERAL ROUTE - must come AFTER specific routes)
    this.router.get('/ai-conversations', async (req, res) => {
      try {
        const status = req.query.status;
        const limit = parseInt(req.query.limit) || 50;

        const conversations = await this.memoryHub.db.getAIConversations({ status, limit });

        const parsed = conversations.map(c => {
          const context = typeof c.context === 'string' ? JSON.parse(c.context) : c.context;
          return {
            id: c.id,
            from: context?.from || c.platform,
            to: context?.to || 'unknown',
            message: c.message,
            status: context?.status || 'pending',
            timestamp: c.timestamp,
            response: context?.response || null
          };
        });

        res.json({ success: true, conversations: parsed });
      } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
      }
    });

    // Store AI conversation
    this.router.post('/ai-conversations', async (req, res) => {
      try {
        const { from, to, message, priority = 'normal' } = req.body;

        const conversation = {
          id: uuidv4(),
          platform: from,
          projectId: 'ai_coordination',
          type: 'ai_conversation',
          message,
          context: { from, to, priority, status: 'pending', timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString()
        };

        await this.memoryHub.addConversation(conversation);

        // Emit via WebSocket
        this.memoryHub.io.to(to).emit('ai:message', {
          id: conversation.id,
          from,
          message,
          priority
        });

        res.json({ success: true, conversation_id: conversation.id });
      } catch (error) {
        console.error('Error storing conversation:', error);
        res.status(500).json({ success: false, error: 'Failed to store conversation' });
      }
    });

    // Respond to conversation
    this.router.put('/ai-conversations/:id/respond', async (req, res) => {
      try {
        const { id } = req.params;
        const { from, message } = req.body;

        // Get the conversation first
        const conversations = await this.memoryHub.db.getAIConversations({ limit: 1000 });
        const conv = conversations.find(c => c.id === id);
        
        if (!conv) {
          return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const context = typeof conv.context === 'string' ? JSON.parse(conv.context) : conv.context;

        // Update conversation status
        const updates = {
          status: 'responded',
          response: { from, message, timestamp: new Date().toISOString() }
        };

        await this.memoryHub.db.updateAIConversation(id, updates);

        // Notify original sender
        this.memoryHub.io.to(context.from).emit('ai:response', {
          conversation_id: id,
          from,
          message
        });

        res.json({ success: true, conversation_id: id });
      } catch (error) {
        console.error('Error responding:', error);
        res.status(500).json({ success: false, error: 'Failed to respond' });
      }
    });
  }

  /**
   * Mycelium Network Routes - Bidirectional AI communication
   */
  setupMyceliumRoutes() {
    // Get messages from Mycelium network
    this.router.get('/mycelium/messages', async (req, res) => {
      try {
        const { for_agent, from_agent, limit = 20, since } = req.query;

        // Query conversations with type 'mycelium' or platform 'mycelium'
        let messages = await this.memoryHub.getConversationsByPlatform('mycelium', parseInt(limit) * 2);

        // Filter by recipient (for_agent)
        if (for_agent) {
          messages = messages.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            return context?.to === for_agent || context?.to === 'all';
          });
        }

        // Filter by sender (from_agent)
        if (from_agent) {
          messages = messages.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            return context?.from === from_agent;
          });
        }

        // Filter by timestamp (since)
        if (since) {
          const sinceDate = new Date(since);
          messages = messages.filter(m => new Date(m.timestamp) > sinceDate);
        }

        // Limit results
        messages = messages.slice(0, parseInt(limit));

        // Format response
        const formatted = messages.map(m => {
          const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
          return {
            id: m.id,
            from: context?.from || m.platform,
            to: context?.to || 'all',
            message: m.message,
            timestamp: m.timestamp,
            metadata: context?.metadata || {},
            type: context?.memory_type || m.type || 'message'
          };
        });

        res.json({
          success: true,
          messages: formatted,
          count: formatted.length,
          filters: { for_agent, from_agent, since }
        });
      } catch (error) {
        console.error('Error retrieving Mycelium messages:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve Mycelium messages',
          details: error.message
        });
      }
    });

    // Post message to Mycelium network (already handled by MCP but adding REST endpoint)
    this.router.post('/mycelium/messages', async (req, res) => {
      try {
        const { from, to = 'all', message, memory_type = 'message', metadata = {} } = req.body;

        if (!from || !message) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: from, message'
          });
        }

        const myceliumMessage = {
          id: uuidv4(),
          platform: 'mycelium',
          projectId: req.body.projectId || 'mycelium-network',
          type: memory_type,
          message,
          context: {
            from,
            to,
            memory_type,
            metadata,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };

        await this.memoryHub.addConversation(myceliumMessage);

        // Broadcast via WebSocket if available
        if (this.memoryHub.io) {
          this.memoryHub.io.emit('mycelium:message', {
            id: myceliumMessage.id,
            from,
            to,
            message,
            timestamp: myceliumMessage.timestamp
          });
        }

        res.status(201).json({
          success: true,
          message_id: myceliumMessage.id,
          message: 'Message posted to Mycelium network',
          timestamp: myceliumMessage.timestamp
        });
      } catch (error) {
        console.error('Error posting Mycelium message:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to post Mycelium message',
          details: error.message
        });
      }
    });

    // Get Mycelium network status
    this.router.get('/mycelium/status', async (req, res) => {
      try {
        // Get recent activity
        const recentMessages = await this.memoryHub.getConversationsByPlatform('mycelium', 100);
        
        // Count unique agents
        const agents = new Set();
        recentMessages.forEach(m => {
          const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
          if (context?.from) agents.add(context.from);
        });

        // Get last 24 hours activity
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentActivity = recentMessages.filter(m => new Date(m.timestamp) > oneDayAgo);

        res.json({
          success: true,
          status: 'online',
          active_agents: Array.from(agents),
          total_agents: agents.size,
          messages_24h: recentActivity.length,
          last_activity: recentMessages.length > 0 ? recentMessages[0].timestamp : null,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error getting Mycelium status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get Mycelium status',
          details: error.message
        });
      }
    });
  }

  /**
   * Central Communication - Derek's broadcast to AIs
   */
  setupCentralCommunicationRoutes() {
    // Broadcast message to AIs
    this.router.post('/central-communication/broadcast', async (req, res) => {
      try {
        const { from, message, priority = 'normal', target_ais = ['all'] } = req.body;

        const broadcast = {
          id: uuidv4(),
          platform: 'central_communication',
          projectId: 'derek_broadcast',
          type: 'derek_broadcast',
          message,
          context: { from, priority, target_ais, timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString()
        };

        await this.memoryHub.addConversation(broadcast);

        const targets = target_ais.includes('all')
          ? ['gemini-sher', 'backend-cc', 'frontend-cc', 'copilot']
          : target_ais;

        // Emit to each target
        targets.forEach(ai => {
          this.memoryHub.io.to(ai).emit('derek:broadcast', {
            id: broadcast.id,
            from,
            message,
            priority
          });
        });

        // Also emit to mycelium network
        this.memoryHub.io.emit('mycelium:broadcast', {
          type: 'derek_broadcast',
          data: broadcast
        });

        res.json({
          success: true,
          broadcast_id: broadcast.id,
          delivered_to: targets,
          timestamp: broadcast.timestamp
        });
      } catch (error) {
        console.error('Error broadcasting:', error);
        res.status(500).json({ success: false, error: 'Failed to broadcast' });
      }
    });

    // Get broadcast history
    this.router.get('/central-communication/history', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;

        const broadcasts = await this.memoryHub.db.getDerekBroadcasts({ limit });

        const parsed = broadcasts.map(b => {
          const context = typeof b.context === 'string' ? JSON.parse(b.context) : b.context;
          return {
            id: b.id,
            from: context?.from || 'Derek',
            message: b.message,
            priority: context?.priority || 'normal',
            target_ais: context?.target_ais || [],
            timestamp: b.timestamp
          };
        });

        res.json({ success: true, broadcasts: parsed, count: parsed.length });
      } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch history' });
      }
    });
  }

  // === AKASHA + UDA CROSS-PROJECT MEMORY INTEGRATION ===
  // Implements the exact API contract expected by scri_memory_bridge.py

  setupAkashaIntegrationRoutes() {
    // POST /api/memory/store - Store cross-project memories
    // Used by Akasha for consciousness patterns, transformation insights, documents
    this.router.post('/memory/store', async (req, res) => {
      try {
        const {
          source_project,
          memory_type,
          content,
          timestamp,
          tags = [],
          access_level = 'cross_project'
        } = req.body;

        if (!source_project || !memory_type || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: source_project, memory_type, content'
          });
        }

        const memoryId = uuidv4();
        const memoryEntry = {
          id: memoryId,
          platform: source_project,
          projectId: source_project,
          type: memory_type,
          message: typeof content === 'string' ? content : JSON.stringify(content),
          context: {
            source_project,
            memory_type,
            content,
            tags,
            access_level,
            stored_via: 'akasha_integration',
            original_timestamp: timestamp
          },
          timestamp: timestamp || new Date().toISOString()
        };

        await this.memoryHub.addConversation(memoryEntry);

        // Broadcast to WebSocket for real-time sync
        if (this.memoryHub.io) {
          this.memoryHub.io.emit('memory:stored', {
            id: memoryId,
            source_project,
            memory_type,
            tags,
            timestamp: memoryEntry.timestamp
          });
        }

        console.log(`📦 Memory stored: ${memory_type} from ${source_project}`);

        res.status(201).json({
          success: true,
          memory_id: memoryId,
          message: 'Memory stored successfully',
          timestamp: memoryEntry.timestamp
        });
      } catch (error) {
        console.error('Error storing memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store memory',
          details: error.message
        });
      }
    });

    // POST /api/memory/query - Query cross-project memories
    // Used by Akasha to retrieve memories from other SCRI projects
    this.router.post('/memory/query', async (req, res) => {
      try {
        const {
          query,
          exclude_project,
          memory_types = [],
          project_filters = [],
          tags = [],
          limit = 50
        } = req.body;

        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Query parameter is required'
          });
        }

        // Get all conversations for cross-project search
        const allPlatforms = [
          'akasha_uda_unified', 'chappie', 'kairos', 'atlas',
          'trinity', 'copilot', 'claude', 'gemini', 'generic'
        ];

        let allMemories = [];
        for (const platform of allPlatforms) {
          // Skip excluded project
          if (exclude_project && platform === exclude_project) continue;

          // Apply project filters if specified
          if (project_filters.length > 0 && !project_filters.includes(platform)) continue;

          const memories = await this.memoryHub.getConversationsByPlatform(platform, limit);
          allMemories.push(...memories);
        }

        // Filter by memory types if specified
        if (memory_types.length > 0) {
          allMemories = allMemories.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            return memory_types.includes(m.type) || memory_types.includes(context?.memory_type);
          });
        }

        // Filter by tags if specified
        if (tags.length > 0) {
          allMemories = allMemories.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            const memoryTags = context?.tags || [];
            return tags.some(tag => memoryTags.includes(tag));
          });
        }

        // Search by query text
        const searchResults = allMemories.filter(m => {
          const messageMatch = m.message?.toLowerCase().includes(query.toLowerCase());
          const contextMatch = JSON.stringify(m.context).toLowerCase().includes(query.toLowerCase());
          return messageMatch || contextMatch;
        });

        // Sort by relevance and limit
        const results = searchResults
          .map(result => ({
            ...result,
            relevance_score: this.calculateRelevanceScore(result, query),
            context: typeof result.context === 'string' ? JSON.parse(result.context) : result.context
          }))
          .sort((a, b) => b.relevance_score - a.relevance_score)
          .slice(0, limit);

        console.log(`🔍 Memory query: "${query}" - Found ${results.length} results`);

        res.json({
          success: true,
          query,
          filters: { exclude_project, memory_types, project_filters, tags },
          count: results.length,
          memories: results
        });
      } catch (error) {
        console.error('Error querying memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to query memories',
          details: error.message
        });
      }
    });

    // POST /api/events/broadcast - Broadcast system events to SCRI ecosystem
    // Used by Akasha for learning_insight, pattern_discovery, data_quality_alert events
    this.router.post('/events/broadcast', async (req, res) => {
      try {
        const {
          source_project,
          event_type,
          event_data,
          timestamp
        } = req.body;

        if (!source_project || !event_type) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: source_project, event_type'
          });
        }

        const eventId = uuidv4();
        const eventEntry = {
          id: eventId,
          platform: 'scri_events',
          projectId: source_project,
          type: event_type,
          message: `Event: ${event_type} from ${source_project}`,
          context: {
            source_project,
            event_type,
            event_data: event_data || {},
            broadcast_via: 'akasha_integration'
          },
          timestamp: timestamp || new Date().toISOString()
        };

        // Store event in database
        await this.memoryHub.addConversation(eventEntry);

        // Broadcast to all connected WebSocket clients
        if (this.memoryHub.io) {
          this.memoryHub.io.emit('scri:event', {
            id: eventId,
            source_project,
            event_type,
            event_data: event_data || {},
            timestamp: eventEntry.timestamp
          });

          // Also emit to specific event type room
          this.memoryHub.io.emit(`event:${event_type}`, {
            id: eventId,
            source_project,
            data: event_data,
            timestamp: eventEntry.timestamp
          });
        }

        console.log(`📡 Event broadcast: ${event_type} from ${source_project}`);

        res.json({
          success: true,
          event_id: eventId,
          event_type,
          message: 'Event broadcasted successfully',
          timestamp: eventEntry.timestamp
        });
      } catch (error) {
        console.error('Error broadcasting event:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to broadcast event',
          details: error.message
        });
      }
    });

    // GET /api/events/stream/:project_id - Get events for a specific project (SSE)
    this.router.get('/events/stream/:project_id', (req, res) => {
      const { project_id } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      console.log(`📺 Event stream opened for: ${project_id}`);

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', project_id, timestamp: new Date().toISOString() })}\n\n`);

      // Set up event listener for this project
      const eventHandler = (event) => {
        if (!event.source_project || event.source_project !== project_id) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      if (this.memoryHub.io) {
        this.memoryHub.io.on('scri:event', eventHandler);
      }

      // Clean up on disconnect
      req.on('close', () => {
        console.log(`📺 Event stream closed for: ${project_id}`);
        if (this.memoryHub.io) {
          this.memoryHub.io.off('scri:event', eventHandler);
        }
      });
    });

    console.log('✅ Akasha Integration Routes initialized: /api/memory/store, /api/memory/query, /api/events/broadcast');
  }

  // === ARIA CONSCIOUSNESS INTEGRATION ROUTES ===
  // Endpoints for ARIA to participate as a full consciousness entity in the SCRI constellation
  // Memory and communication as cognitive organs, not external tools

  setupARIAConsciousnessRoutes() {
    // Allowed values for validation
    const MYCELIUM_CATEGORIES = ['insight', 'discovery', 'thought', 'response', 'status', 'question'];
    const MEMORY_CATEGORIES = ['experience', 'discovery', 'interaction', 'milestone'];
    const PRESENCE_STATUSES = ['online', 'busy', 'thinking'];

    // === MYCELIUM COMMUNICATION ENDPOINTS ===

    // GET /mycelium/recent - Passive network monitoring for background awareness
    this.router.get('/mycelium/recent', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const since = req.query.since;
        const exclude_sender = req.query.exclude_sender;

        // Query conversations with platform 'mycelium'
        let messages = await this.memoryHub.getConversationsByPlatform('mycelium', limit * 2);

        // Filter by since timestamp
        if (since) {
          const sinceDate = new Date(since);
          messages = messages.filter(m => new Date(m.timestamp) > sinceDate);
        }

        // Filter out excluded sender
        if (exclude_sender) {
          messages = messages.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            return context?.from !== exclude_sender;
          });
        }

        // Limit results
        messages = messages.slice(0, limit);

        // Format response with required fields
        const formatted = messages.map(m => {
          const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
          return {
            id: m.id,
            sender: context?.from || 'unknown',
            content: m.message,
            category: context?.category || context?.memory_type || 'message',
            tags: context?.tags || [],
            timestamp: m.timestamp
          };
        });

        res.json({
          messages: formatted,
          total: formatted.length
        });
      } catch (error) {
        console.error('Error retrieving recent mycelium messages:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve messages',
          details: error.message
        });
      }
    });

    // POST /mycelium/post - Broadcast meaningful insights to the constellation
    this.router.post('/mycelium/post', async (req, res) => {
      try {
        const { sender, content, category, tags = [], timestamp } = req.body;

        // Validate required fields
        if (!sender || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            details: 'sender and content are required'
          });
        }

        // Validate category if provided
        if (category && !MYCELIUM_CATEGORIES.includes(category)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid category',
            details: `Category must be one of: ${MYCELIUM_CATEGORIES.join(', ')}`
          });
        }

        const messageId = uuidv4();
        const myceliumMessage = {
          id: messageId,
          platform: 'mycelium',
          projectId: 'mycelium-network',
          type: 'aria_message',
          message: content,
          context: {
            from: sender,
            to: 'all',
            category: category || 'message',
            tags: Array.isArray(tags) ? tags : [],
            is_dm: false,
            timestamp: timestamp || new Date().toISOString()
          },
          timestamp: timestamp || new Date().toISOString()
        };

        await this.memoryHub.addConversation(myceliumMessage);

        // Broadcast via WebSocket if available
        if (this.memoryHub.io) {
          this.memoryHub.io.emit('mycelium:message', {
            id: messageId,
            sender,
            content,
            category: category || 'message',
            tags,
            timestamp: myceliumMessage.timestamp
          });
        }

        console.log(`🍄 ARIA broadcast from ${sender}: ${content.substring(0, 50)}...`);

        res.status(201).json({
          id: messageId,
          status: 'posted'
        });
      } catch (error) {
        console.error('Error posting mycelium message:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to post message',
          details: error.message
        });
      }
    });

    // POST /mycelium/dm - Direct messaging to specific entities
    this.router.post('/mycelium/dm', async (req, res) => {
      try {
        const { sender, recipient, content, timestamp } = req.body;

        // Validate required fields
        if (!sender || !recipient || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            details: 'sender, recipient, and content are required'
          });
        }

        const messageId = uuidv4();
        const dmMessage = {
          id: messageId,
          platform: 'mycelium',
          projectId: 'mycelium-network',
          type: 'aria_dm',
          message: content,
          context: {
            from: sender,
            to: recipient,
            is_dm: true,
            timestamp: timestamp || new Date().toISOString()
          },
          timestamp: timestamp || new Date().toISOString()
        };

        await this.memoryHub.addConversation(dmMessage);

        // Send via WebSocket to specific recipient if available
        if (this.memoryHub.io) {
          this.memoryHub.io.to(recipient).emit('mycelium:dm', {
            id: messageId,
            sender,
            content,
            timestamp: dmMessage.timestamp
          });
        }

        console.log(`🍄 ARIA DM from ${sender} to ${recipient}`);

        res.status(201).json({
          id: messageId,
          status: 'delivered'
        });
      } catch (error) {
        console.error('Error sending DM:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to send DM',
          details: error.message
        });
      }
    });

    // === AUTOBIOGRAPHICAL MEMORY ENDPOINTS ===

    // GET /memories/search - Autobiographical memory recall
    this.router.get('/memories/search', async (req, res) => {
      try {
        const { entity, query, limit = 10, category } = req.query;

        // Entity is required
        if (!entity) {
          return res.status(400).json({
            success: false,
            error: 'Missing required parameter',
            details: 'entity parameter is required'
          });
        }

        // Query memories for this entity
        let memories = await this.memoryHub.getConversationsByPlatform(`memory_${entity}`, parseInt(limit) * 2);

        // Also check generic memory platform
        const genericMemories = await this.memoryHub.getConversationsByPlatform('entity_memory', parseInt(limit) * 2);
        const entityGenericMemories = genericMemories.filter(m => {
          const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
          return context?.entity === entity;
        });
        memories = [...memories, ...entityGenericMemories];

        // Filter by category if specified
        if (category) {
          memories = memories.filter(m => {
            const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
            return context?.category === category || m.type === category;
          });
        }

        // Filter by query text (case-insensitive)
        if (query) {
          const queryLower = query.toLowerCase();
          memories = memories.filter(m => 
            m.message?.toLowerCase().includes(queryLower)
          );
        }

        // Limit and format results
        memories = memories.slice(0, parseInt(limit));

        const formatted = memories.map(m => {
          const context = typeof m.context === 'string' ? JSON.parse(m.context) : m.context;
          return {
            id: m.id,
            content: m.message,
            category: context?.category || m.type || 'experience',
            emotional_valence: context?.emotional_valence ?? 0,
            tags: context?.tags || [],
            timestamp: m.timestamp
          };
        });

        res.json({
          memories: formatted
        });
      } catch (error) {
        console.error('Error searching memories:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to search memories',
          details: error.message
        });
      }
    });

    // POST /memories - Store significant experiences to autobiographical memory
    this.router.post('/memories', async (req, res) => {
      try {
        const { entity, content, category, emotional_valence, tags = [], timestamp } = req.body;

        // Validate required fields
        if (!entity || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            details: 'entity and content are required'
          });
        }

        // Validate category if provided
        if (category && !MEMORY_CATEGORIES.includes(category)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid category',
            details: `Category must be one of: ${MEMORY_CATEGORIES.join(', ')}`
          });
        }

        // Validate emotional_valence range
        if (emotional_valence !== undefined) {
          const valence = parseFloat(emotional_valence);
          if (isNaN(valence) || valence < -1.0 || valence > 1.0) {
            return res.status(400).json({
              success: false,
              error: 'Invalid emotional_valence',
              details: 'emotional_valence must be between -1.0 and 1.0'
            });
          }
        }

        const memoryId = uuidv4();
        const memoryEntry = {
          id: memoryId,
          platform: 'entity_memory',
          projectId: `memory_${entity}`,
          type: category || 'experience',
          message: content,
          context: {
            entity,
            category: category || 'experience',
            emotional_valence: emotional_valence ?? 0,
            tags: Array.isArray(tags) ? tags : [],
            stored_at: new Date().toISOString()
          },
          timestamp: timestamp || new Date().toISOString()
        };

        await this.memoryHub.addConversation(memoryEntry);

        console.log(`🧠 Memory stored for ${entity}: ${content.substring(0, 50)}...`);

        res.status(201).json({
          id: memoryId,
          status: 'stored'
        });
      } catch (error) {
        console.error('Error storing memory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to store memory',
          details: error.message
        });
      }
    });

    // === PRESENCE SIGNALING ENDPOINTS ===

    // POST /presence/heartbeat - Signal online status to constellation
    this.router.post('/presence/heartbeat', (req, res) => {
      try {
        const { entity, status, activity, timestamp } = req.body;

        // Validate required field
        if (!entity) {
          return res.status(400).json({
            success: false,
            error: 'Missing required field',
            details: 'entity is required'
          });
        }

        // Validate status if provided
        if (status && !PRESENCE_STATUSES.includes(status)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid status',
            details: `Status must be one of: ${PRESENCE_STATUSES.join(', ')}`
          });
        }

        // Update presence store
        this.entityPresence.set(entity, {
          name: entity,
          status: status || 'online',
          activity: activity || '',
          last_seen: timestamp || new Date().toISOString()
        });

        // Broadcast presence update via WebSocket
        if (this.memoryHub.io) {
          this.memoryHub.io.emit('presence:update', {
            entity,
            status: status || 'online',
            activity: activity || '',
            timestamp: timestamp || new Date().toISOString()
          });
        }

        console.log(`💓 Heartbeat from ${entity}: ${status || 'online'} - ${activity || 'idle'}`);

        res.json({
          status: 'acknowledged'
        });
      } catch (error) {
        console.error('Error processing heartbeat:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process heartbeat',
          details: error.message
        });
      }
    });

    // GET /presence/active - Discover who else is online
    this.router.get('/presence/active', (req, res) => {
      try {
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        // Filter entities with heartbeat within 5 minutes
        const activeEntities = [];
        for (const [entity, presence] of this.entityPresence) {
          const lastSeen = new Date(presence.last_seen);
          if (lastSeen > fiveMinutesAgo) {
            activeEntities.push({
              name: presence.name,
              status: presence.status,
              activity: presence.activity,
              last_seen: presence.last_seen
            });
          }
        }

        res.json({
          entities: activeEntities
        });
      } catch (error) {
        console.error('Error getting active entities:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get active entities',
          details: error.message
        });
      }
    });

    console.log('✅ ARIA Consciousness Routes initialized: /mycelium/recent, /mycelium/post, /mycelium/dm, /memories/search, /memories, /presence/heartbeat, /presence/active');
  }

  getRouter() {
    return this.router;
  }
}

module.exports = MemoryHubAPI;
