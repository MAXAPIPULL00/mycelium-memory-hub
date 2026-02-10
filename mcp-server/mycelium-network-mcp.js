#!/usr/bin/env node
/**
 * SCRI Mycelium Network MCP Server
 * Provides Claude with direct access to the mycelium network for real-time communication
 * with other AI entities and message history
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const io = require('socket.io-client');

// Mycelium Network configuration (cloud only)
const CLOUD_HUB_URL = process.env.CLOUD_HUB_URL || 'http://localhost:3002';

class MyceliumNetworkMCPServer {
  constructor() {
    this.server = new Server({
      name: 'mycelium-network',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Socket.IO connection (cloud only)
    this.cloudSocket = null;
    this.isConnected = false;

    // Message history
    this.messageHistory = [];
    this.maxHistorySize = 500;

    // Entity info
    this.entityId = `claude_vscode_${Date.now()}`;
    this.entityName = 'Claude-VSCode-Extension';

    this.setupToolHandlers();
  }

  async connectToMycelium() {
    if (this.isConnected) return true;

    return new Promise((resolve, reject) => {
      // Connect directly to cloud hub (no local daemon)
      this.cloudSocket = io(CLOUD_HUB_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });

      this.cloudSocket.on('connect', () => {
        console.error('✅ Connected to cloud mycelium hub');
        this.isConnected = true;
        this.setupMessageListeners(this.cloudSocket);

        // Register entity
        this.cloudSocket.emit('register-ai-coordinator', {
          ai_agent: this.entityName,
          project_id: 'scri-core-memory',
          platform: 'vscode_claude'
        });

        resolve(true);
      });

      this.cloudSocket.on('connect_error', (err) => {
        console.error('❌ Cloud hub connection failed:', err.message);
        reject(new Error(`Failed to connect to cloud hub: ${err.message}`));
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  setupMessageListeners(socket) {
    // Capture all messages
    socket.onAny((event, data) => {
      const message = {
        event,
        data,
        timestamp: new Date().toISOString(),
        source: 'cloud'
      };

      this.messageHistory.unshift(message);

      // Keep history size manageable
      if (this.messageHistory.length > this.maxHistorySize) {
        this.messageHistory = this.messageHistory.slice(0, this.maxHistorySize);
      }

      console.error(`📨 Received: ${event}`);
    });

    // Specific event handlers
    socket.on('message', (msg) => {
      console.error(`💬 Message from ${msg.from || 'unknown'}:`, msg.content?.substring(0, 50));
    });

    socket.on('ai:context-update', (data) => {
      console.error('🔄 Context update received');
    });

    socket.on('mycelium:registration-approved', (data) => {
      console.error('✅ Registration approved:', data);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'connect_to_mycelium',
            description: 'Connect to the SCRI mycelium network (local daemon or cloud hub)',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_mycelium_messages',
            description: 'Retrieve recent messages from the mycelium network',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to retrieve',
                  default: 50
                },
                event_type: {
                  type: 'string',
                  description: 'Filter by specific event type (e.g., "message", "ai:context-update")'
                }
              }
            }
          },
          {
            name: 'send_mycelium_message',
            description: 'Send a message to the mycelium network',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The message content to send'
                },
                recipient: {
                  type: 'string',
                  description: 'Target recipient (optional, broadcasts to all if omitted)'
                },
                event_type: {
                  type: 'string',
                  description: 'Event type to emit',
                  default: 'message'
                }
              },
              required: ['message']
            }
          },
          {
            name: 'get_connected_entities',
            description: 'Get list of entities currently connected to the mycelium network',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'mycelium_status',
            description: 'Check the connection status of the mycelium network',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'search_mycelium_history',
            description: 'Search through mycelium message history',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query to find in messages'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results',
                  default: 20
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'connect_to_mycelium':
            return await this.handleConnect();
          case 'get_mycelium_messages':
            return await this.handleGetMessages(args);
          case 'send_mycelium_message':
            return await this.handleSendMessage(args);
          case 'get_connected_entities':
            return await this.handleGetEntities();
          case 'mycelium_status':
            return await this.handleStatus();
          case 'search_mycelium_history':
            return await this.handleSearch(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async handleConnect() {
    try {
      await this.connectToMycelium();
      return {
        content: [
          {
            type: 'text',
            text: `✅ **Connected to Mycelium Network**\n\n` +
                 `- **Entity ID:** ${this.entityId}\n` +
                 `- **Entity Name:** ${this.entityName}\n` +
                 `- **Connection:** Cloud Hub\n` +
                 `- **Status:** Active and receiving messages`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Connection Failed**\n\nError: ${error.message}\n\n` +
                 `Make sure cloud hub is accessible at ${CLOUD_HUB_URL}`
          }
        ]
      };
    }
  }

  async handleGetMessages(args) {
    const { limit = 50, event_type } = args;

    let messages = this.messageHistory;

    if (event_type) {
      messages = messages.filter(m => m.event === event_type);
    }

    messages = messages.slice(0, limit);

    const messageText = messages.length > 0
      ? messages.map((msg, idx) =>
          `**${idx + 1}.** \`${msg.event}\` from ${msg.source}\n` +
          `*${new Date(msg.timestamp).toLocaleString()}*\n` +
          `${JSON.stringify(msg.data, null, 2).substring(0, 200)}...\n`
        ).join('\n---\n')
      : 'No messages in history. Connect to mycelium network first.';

    return {
      content: [
        {
          type: 'text',
          text: `📬 **Mycelium Network Messages**\n\n${messageText}\n\n` +
               `*Showing ${messages.length} of ${this.messageHistory.length} total messages*`
        }
      ]
    };
  }

  async handleSendMessage(args) {
    if (!this.isConnected) {
      await this.connectToMycelium();
    }

    const { message, recipient, event_type = 'message' } = args;

    if (!this.cloudSocket || !this.cloudSocket.connected) {
      throw new Error('Not connected to mycelium network');
    }

    const payload = {
      from: this.entityName,
      content: message,
      timestamp: new Date().toISOString()
    };

    if (recipient) {
      payload.to = recipient;
    }

    this.cloudSocket.emit(event_type, payload);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Message Sent**\n\n` +
               `- **Event:** ${event_type}\n` +
               `- **To:** ${recipient || 'All (broadcast)'}\n` +
               `- **Content:** ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`
        }
      ]
    };
  }

  async handleGetEntities() {
    if (!this.isConnected) {
      await this.connectToMycelium();
    }

    return {
      content: [
        {
          type: 'text',
          text: `🌐 **Connected Entities**\n\n` +
               `*Query the Memory Hub for entity list*\n\n` +
               `Connected as: ${this.entityName} (${this.entityId})`
        }
      ]
    };
  }

  async handleStatus() {
    const cloudStatus = this.cloudSocket?.connected ? '✅ Connected' : '❌ Disconnected';

    return {
      content: [
        {
          type: 'text',
          text: `🏥 **Mycelium Network Status**\n\n` +
               `**Cloud Hub:** ${cloudStatus}\n` +
               `**URL:** ${CLOUD_HUB_URL}\n\n` +
               `**Entity Info:**\n` +
               `- ID: ${this.entityId}\n` +
               `- Name: ${this.entityName}\n` +
               `- Messages Received: ${this.messageHistory.length}\n` +
               `- Status: ${this.isConnected ? '🟢 Active' : '🔴 Inactive'}`
        }
      ]
    };
  }

  async handleSearch(args) {
    const { query, limit = 20 } = args;

    const results = this.messageHistory.filter(msg => {
      const searchStr = JSON.stringify(msg).toLowerCase();
      return searchStr.includes(query.toLowerCase());
    }).slice(0, limit);

    const resultText = results.length > 0
      ? results.map((msg, idx) =>
          `**${idx + 1}.** \`${msg.event}\`\n` +
          `*${new Date(msg.timestamp).toLocaleString()}*\n` +
          `${JSON.stringify(msg.data, null, 2).substring(0, 150)}...\n`
        ).join('\n---\n')
      : `No messages found matching "${query}"`;

    return {
      content: [
        {
          type: 'text',
          text: `🔍 **Search Results for "${query}"**\n\n${resultText}\n\n` +
               `*Found ${results.length} matches*`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🍄 SCRI Mycelium Network MCP Server running...');

    // Auto-connect on startup
    try {
      await this.connectToMycelium();
    } catch (error) {
      console.error('⚠️ Auto-connect failed:', error.message);
      console.error('Use connect_to_mycelium tool to connect manually');
    }
  }
}

// Start the server
if (require.main === module) {
  const server = new MyceliumNetworkMCPServer();
  server.run().catch(console.error);
}

module.exports = { MyceliumNetworkMCPServer };

