// Platform Bridge - Connects web chat localStorage to SCRI Core Memory Hub
const { v4: uuidv4 } = require('uuid');

class WebChatBridge {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.platform = 'web-chat';
    this.syncQueue = [];
    this.isConnected = false;
    this.lastSyncTime = null;
  }

  async connect() {
    try {
      console.log('🌐 Connecting Web Chat Bridge to SCRI Core Memory Hub...');
      
      // Register this bridge with the memory hub
      await this.memoryHub.registerBridge(this.platform, this);
      this.isConnected = true;
      
      console.log('✅ Web Chat Bridge connected successfully');
      
      // Start periodic sync
      this.startPeriodicSync();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to connect Web Chat Bridge:', error);
      return false;
    }
  }

  // Sync conversations from localStorage to memory hub
  async syncToMemoryHub(chatData) {
    if (!this.isConnected) {
      console.log('⚠️ Bridge not connected, queuing sync...');
      this.syncQueue.push(chatData);
      return;
    }

    try {
      console.log('🔄 Syncing web chat conversations to Memory Hub...');
      
      // Process conversations from localStorage format
      const conversations = this.parseWebChatData(chatData);
      
      for (const conversation of conversations) {
        await this.memoryHub.addConversation({
          id: conversation.id || uuidv4(),
          platform: this.platform,
          projectId: conversation.projectId || 'web-chat-general',
          message: conversation.message,
          context: {
            timestamp: conversation.timestamp,
            type: conversation.type || 'user_message',
            metadata: conversation.metadata || {}
          },
          timestamp: conversation.timestamp || new Date().toISOString(),
          type: conversation.type || 'general'
        });
      }
      
      this.lastSyncTime = new Date().toISOString();
      console.log(`✅ Synced ${conversations.length} conversations to Memory Hub`);
      
    } catch (error) {
      console.error('❌ Error syncing to Memory Hub:', error);
    }
  }

  // Parse localStorage chat data format
  parseWebChatData(chatData) {
    const conversations = [];
    
    try {
      if (typeof chatData === 'string') {
        chatData = JSON.parse(chatData);
      }
      
      // Handle different localStorage formats
      if (Array.isArray(chatData)) {
        // Format: array of messages
        chatData.forEach((item, index) => {
          conversations.push({
            id: item.id || `web-chat-${Date.now()}-${index}`,
            message: item.message || item.content || JSON.stringify(item),
            timestamp: item.timestamp || new Date().toISOString(),
            type: item.type || 'user_message',
            projectId: item.projectId || 'web-chat-general',
            metadata: {
              role: item.role,
              original: item
            }
          });
        });
      } else if (chatData.conversations) {
        // Format: {conversations: [...]}
        conversations.push(...this.parseWebChatData(chatData.conversations));
      } else if (chatData.messages) {
        // Format: {messages: [...]}
        conversations.push(...this.parseWebChatData(chatData.messages));
      } else {
        // Single conversation object
        conversations.push({
          id: chatData.id || `web-chat-${Date.now()}`,
          message: chatData.message || chatData.content || JSON.stringify(chatData),
          timestamp: chatData.timestamp || new Date().toISOString(),
          type: chatData.type || 'user_message',
          projectId: chatData.projectId || 'web-chat-general',
          metadata: {
            original: chatData
          }
        });
      }
      
    } catch (error) {
      console.error('Error parsing web chat data:', error);
    }
    
    return conversations;
  }

  // Get conversations for web chat (Memory Hub -> localStorage)
  async getConversationsForWebChat(projectId = 'web-chat-general', limit = 50) {
    try {
      const conversations = await this.memoryHub.getConversationsByProject(projectId, limit);
      
      // Convert to web chat format
      const webChatFormat = conversations.map(conv => ({
        id: conv.id,
        role: conv.context?.metadata?.role || 'user',
        content: conv.message,
        timestamp: conv.timestamp,
        type: conv.type,
        platform: conv.platform
      }));
      
      return webChatFormat;
    } catch (error) {
      console.error('Error getting conversations for web chat:', error);
      return [];
    }
  }

  // Real-time sync method for active chat sessions
  async pushConversation(conversation) {
    if (!this.isConnected) {
      this.syncQueue.push(conversation);
      return;
    }

    try {
      await this.memoryHub.addConversation({
        id: conversation.id || uuidv4(),
        platform: this.platform,
        projectId: conversation.projectId || 'web-chat-general',
        message: conversation.message || conversation.content,
        context: {
          role: conversation.role,
          timestamp: conversation.timestamp,
          metadata: conversation.metadata || {}
        },
        timestamp: conversation.timestamp || new Date().toISOString(),
        type: conversation.type || 'general'
      });
      
      console.log('📤 Real-time conversation pushed to Memory Hub');
    } catch (error) {
      console.error('Error pushing conversation:', error);
    }
  }

  // Periodic sync for queued items
  startPeriodicSync() {
    setInterval(async () => {
      if (this.syncQueue.length > 0 && this.isConnected) {
        console.log(`🔄 Processing ${this.syncQueue.length} queued sync items...`);
        
        const queue = [...this.syncQueue];
        this.syncQueue = [];
        
        for (const item of queue) {
          await this.syncToMemoryHub(item);
        }
      }
    }, 30000); // Sync every 30 seconds
  }

  // Bridge status
  getStatus() {
    return {
      platform: this.platform,
      connected: this.isConnected,
      queueSize: this.syncQueue.length,
      lastSync: this.lastSyncTime
    };
  }

  disconnect() {
    this.isConnected = false;
    console.log('🔌 Web Chat Bridge disconnected');
  }
}

class VSCodeBridge {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.platform = 'vscode-extension';
    this.isConnected = false;
    this.activeProject = null;
  }

  async connect() {
    try {
      console.log('🛠️ Connecting VS Code Bridge to SCRI Core Memory Hub...');
      
      // Register this bridge with the memory hub
      await this.memoryHub.registerBridge(this.platform, this);
      this.isConnected = true;
      
      console.log('✅ VS Code Bridge connected successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect VS Code Bridge:', error);
      return false;
    }
  }

  // Set active project context
  setActiveProject(projectPath) {
    this.activeProject = projectPath;
    console.log(`📁 VS Code Bridge: Active project set to ${projectPath}`);
  }

  // Sync development session data
  async syncDevelopmentSession(sessionData) {
    if (!this.isConnected) return;

    try {
      const conversation = {
        id: uuidv4(),
        platform: this.platform,
        projectId: sessionData.projectId || this.activeProject || 'vscode-general',
        message: sessionData.action || sessionData.description,
        context: {
          action: sessionData.action,
          filePath: sessionData.filePath,
          codeGenerated: sessionData.codeGenerated,
          timestamp: sessionData.timestamp,
          metadata: {
            type: 'development_action',
            files_modified: sessionData.filesModified || [],
            success: sessionData.success || true
          }
        },
        timestamp: sessionData.timestamp || new Date().toISOString(),
        type: 'development'
      };

      await this.memoryHub.addConversation(conversation);
      console.log('📤 Development session synced to Memory Hub');
      
    } catch (error) {
      console.error('Error syncing development session:', error);
    }
  }

  // Get project context for VS Code
  async getProjectContext(projectPath) {
    try {
      const projectId = projectPath || this.activeProject;
      if (!projectId) return null;

      const conversations = await this.memoryHub.getConversationsByProject(projectId, 100);
      const patterns = await this.memoryHub.getPatterns(projectId);
      
      return {
        projectId,
        recentConversations: conversations.slice(0, 10),
        developmentPatterns: patterns.filter(p => p.pattern_type === 'development'),
        codePatterns: patterns.filter(p => p.pattern_type === 'code_generation'),
        projectStats: await this.memoryHub.getProjectStats(projectId)
      };
    } catch (error) {
      console.error('Error getting project context:', error);
      return null;
    }
  }

  getStatus() {
    return {
      platform: this.platform,
      connected: this.isConnected,
      activeProject: this.activeProject
    };
  }

  disconnect() {
    this.isConnected = false;
    console.log('🔌 VS Code Bridge disconnected');
  }
}

module.exports = {
  WebChatBridge,
  VSCodeBridge
};