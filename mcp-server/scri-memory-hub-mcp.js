#!/usr/bin/env node
/**
 * SCRI Memory Hub MCP Server
 * Provides Claude Desktop with direct access to the SCRI Memory Hub
 * for persistent memory and knowledge sharing across conversations
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ListToolsRequestSchema 
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

// Memory Hub configuration (cloud only)
const MEMORY_HUB_URL = process.env.SCRI_MEMORY_HUB_URL || 'http://localhost:3002';

class SCRIMemoryHubMCPServer {
  constructor() {
    this.server = new Server({
      name: 'scri-memory-hub',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.projectId = 'claude_desktop_mcp';
    this.sessionId = `claude_session_${Date.now()}`;
    this.setupToolHandlers();
  }

  async getMemoryHubUrl() {
    // Always use cloud hub
    return MEMORY_HUB_URL;
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'store_memory',
            description: 'Store a conversation or knowledge entry in the SCRI Memory Hub',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The message or knowledge to store'
                },
                context: {
                  type: 'object',
                  description: 'Additional context (topic, importance, tags, etc.)',
                  properties: {
                    topic: { type: 'string' },
                    importance: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    tags: { type: 'array', items: { type: 'string' } },
                    category: { type: 'string' }
                  }
                },
                memory_type: {
                  type: 'string',
                  description: 'Type of memory (conversation, knowledge, insight, etc.)',
                  default: 'conversation'
                }
              },
              required: ['message']
            }
          },
          {
            name: 'search_memory',
            description: 'Search through stored memories in the SCRI Memory Hub',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query to find relevant memories'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 10
                },
                memory_type: {
                  type: 'string',
                  description: 'Filter by memory type'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_conversation_history',
            description: 'Retrieve conversation history from the Memory Hub',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Number of recent conversations to retrieve',
                  default: 50
                },
                since: {
                  type: 'string',
                  description: 'ISO timestamp to get conversations since'
                }
              }
            }
          },
          {
            name: 'get_scri_knowledge',
            description: 'Get SCRI-specific knowledge and project information',
            inputSchema: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'SCRI topic to query (architecture, apis, deployment, etc.)'
                }
              }
            }
          },
          {
            name: 'register_claude_session',
            description: 'Register this Claude Desktop session with the Memory Hub',
            inputSchema: {
              type: 'object',
              properties: {
                session_name: {
                  type: 'string',
                  description: 'Optional name for this session'
                }
              }
            }
          },
          {
            name: 'memory_hub_status',
            description: 'Check the status and connectivity of the SCRI Memory Hub',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'read_mycelium_messages',
            description: 'Read messages from the Mycelium Network (bidirectional AI communication)',
            inputSchema: {
              type: 'object',
              properties: {
                for_agent: {
                  type: 'string',
                  description: 'Filter messages for a specific agent (e.g., "kiro-claude", "nexus-frontend-claude")'
                },
                from_agent: {
                  type: 'string',
                  description: 'Filter messages from a specific agent'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to retrieve',
                  default: 20
                },
                since: {
                  type: 'string',
                  description: 'ISO timestamp to get messages after this time'
                }
              }
            }
          },
          {
            name: 'post_mycelium_message',
            description: 'Post a message to the Mycelium Network for other AIs to read',
            inputSchema: {
              type: 'object',
              properties: {
                from: {
                  type: 'string',
                  description: 'Your agent identifier (e.g., "kiro-claude")'
                },
                to: {
                  type: 'string',
                  description: 'Target agent or "all" for broadcast',
                  default: 'all'
                },
                message: {
                  type: 'string',
                  description: 'The message content'
                },
                memory_type: {
                  type: 'string',
                  description: 'Type of message (message, decision, milestone, issue, etc.)',
                  default: 'message'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata for the message'
                }
              },
              required: ['from', 'message']
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
          case 'store_memory':
            return await this.storeMemory(args);
          case 'search_memory':
            return await this.searchMemory(args);
          case 'get_conversation_history':
            return await this.getConversationHistory(args);
          case 'get_scri_knowledge':
            return await this.getSCRIKnowledge(args);
          case 'register_claude_session':
            return await this.registerClaudeSession(args);
          case 'memory_hub_status':
            return await this.getMemoryHubStatus();
          case 'read_mycelium_messages':
            return await this.readMyceliumMessages(args);
          case 'post_mycelium_message':
            return await this.postMyceliumMessage(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async storeMemory(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { message, context = {}, memory_type = 'conversation' } = args;

    const memory = {
      platform: 'claude_desktop_mcp',
      projectId: this.projectId,
      message: message,
      context: {
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
        ...context
      },
      type: memory_type
    };

    const response = await axios.post(`${hubUrl}/api/conversations`, memory);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Memory stored successfully!\n\n**Details:**\n- Memory ID: ${response.data.conversationId}\n- Hub: ${hubUrl}\n- Type: ${memory_type}\n- Session: ${this.sessionId}`
        }
      ]
    };
  }

  async searchMemory(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { query, limit = 10, memory_type } = args;

    // Try the search endpoint first
    let searchUrl = `${hubUrl}/api/conversations/project/${this.projectId}?limit=${limit * 2}`;
    const response = await axios.get(searchUrl);
    
    let conversations = response.data.conversations || [];
    
    // Filter by memory type if specified
    if (memory_type) {
      conversations = conversations.filter(c => c.type === memory_type);
    }

    // Simple text search through messages
    const searchResults = conversations.filter(c => 
      c.message.toLowerCase().includes(query.toLowerCase()) ||
      (c.context && JSON.stringify(c.context).toLowerCase().includes(query.toLowerCase()))
    ).slice(0, limit);

    const resultText = searchResults.length > 0 
      ? searchResults.map((result, index) => 
          `**${index + 1}. ${result.context?.topic || 'Memory'}** (${result.type || 'conversation'})\n` +
          `*${new Date(result.timestamp).toLocaleDateString()}*\n` +
          `${result.message.substring(0, 200)}${result.message.length > 200 ? '...' : ''}\n`
        ).join('\n---\n')
      : 'No memories found matching your query.';

    return {
      content: [
        {
          type: 'text',
          text: `🔍 **Search Results for "${query}"**\n\n${resultText}\n\n*Found ${searchResults.length} results from ${hubUrl}*`
        }
      ]
    };
  }

  async getConversationHistory(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { limit = 50, since } = args;

    let url = `${hubUrl}/api/conversations/project/${this.projectId}?limit=${limit}`;
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }

    const response = await axios.get(url);
    const conversations = response.data.conversations || [];

    const historyText = conversations.length > 0
      ? conversations.slice(0, limit).map((conv, index) => 
          `**${index + 1}.** ${conv.context?.topic || 'Conversation'}\n` +
          `*${new Date(conv.timestamp).toLocaleDateString()} - ${conv.type || 'conversation'}*\n` +
          `${conv.message.substring(0, 150)}${conv.message.length > 150 ? '...' : ''}\n`
        ).join('\n---\n')
      : 'No conversation history found.';

    return {
      content: [
        {
          type: 'text',
          text: `📚 **Conversation History**\n\n${historyText}\n\n*Retrieved ${conversations.length} conversations from ${hubUrl}*`
        }
      ]
    };
  }

  async getSCRIKnowledge(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { topic } = args;

    // Search for SCRI-specific knowledge
    const response = await axios.get(`${hubUrl}/api/conversations/project/scri_knowledge?limit=100`);
    const knowledge = response.data.conversations || [];

    let filteredKnowledge = knowledge;
    if (topic) {
      filteredKnowledge = knowledge.filter(k => 
        k.message.toLowerCase().includes(topic.toLowerCase()) ||
        (k.context && JSON.stringify(k.context).toLowerCase().includes(topic.toLowerCase()))
      );
    }

    const knowledgeText = filteredKnowledge.length > 0
      ? filteredKnowledge.slice(0, 10).map((item, index) => 
          `**${index + 1}. ${item.context?.topic || 'SCRI Knowledge'}**\n` +
          `${item.message}\n`
        ).join('\n---\n')
      : 'No SCRI knowledge found for the specified topic.';

    return {
      content: [
        {
          type: 'text',
          text: `🧠 **SCRI Knowledge${topic ? ` - ${topic}` : ''}**\n\n${knowledgeText}\n\n*From SCRI Memory Hub: ${hubUrl}*`
        }
      ]
    };
  }

  async registerClaudeSession(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { session_name } = args;

    const registration = {
      platform: 'claude_desktop_mcp',
      projectId: this.projectId,
      message: `Claude Desktop MCP session registered${session_name ? `: ${session_name}` : ''}`,
      context: {
        session_id: this.sessionId,
        session_name: session_name || 'Claude Desktop',
        registration_time: new Date().toISOString(),
        mcp_server: true
      },
      type: 'session_registration'
    };

    const response = await axios.post(`${hubUrl}/api/conversations`, registration);

    return {
      content: [
        {
          type: 'text',
          text: `🤖 **Claude Desktop Session Registered**\n\n` +
               `- **Session ID:** ${this.sessionId}\n` +
               `- **Project ID:** ${this.projectId}\n` +
               `- **Memory Hub:** ${hubUrl}\n` +
               `- **Registration ID:** ${response.data.conversationId}\n\n` +
               `✅ You now have persistent memory across conversations!`
        }
      ]
    };
  }

  async getMemoryHubStatus() {
    try {
      const cloudStatus = await this.checkHubStatus(MEMORY_HUB_URL);

      return {
        content: [
          {
            type: 'text',
            text: `🏥 **SCRI Memory Hub Status**\n\n` +
                 `**Cloud Hub (${MEMORY_HUB_URL}):**\n${cloudStatus}\n\n` +
                 `**Current Session:**\n- ID: ${this.sessionId}\n- Project: ${this.projectId}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Memory Hub Status Check Failed**\n\nError: ${error.message}`
          }
        ]
      };
    }
  }

  async checkHubStatus(hubUrl) {
    try {
      const response = await axios.get(`${hubUrl}/health`, { timeout: 5000 });
      const status = response.data;
      return `✅ **Online** - Uptime: ${Math.round(status.uptime || 0)}s\n` +
             `   Projects: ${status.projects?.length || 0}, Platforms: ${status.platforms?.length || 0}`;
    } catch (error) {
      return `❌ **Offline** - ${error.message}`;
    }
  }

  async readMyceliumMessages(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { for_agent, from_agent, limit = 20, since } = args;

    // Build query parameters
    const params = new URLSearchParams();
    if (for_agent) params.append('for_agent', for_agent);
    if (from_agent) params.append('from_agent', from_agent);
    if (limit) params.append('limit', limit.toString());
    if (since) params.append('since', since);

    const url = `${hubUrl}/api/mycelium/messages?${params.toString()}`;
    const response = await axios.get(url);

    const messages = response.data.messages || [];

    const messageText = messages.length > 0
      ? messages.map((msg, index) => 
          `**${index + 1}. From ${msg.from} → ${msg.to}** (${msg.type})\n` +
          `*${new Date(msg.timestamp).toLocaleString()}*\n` +
          `${msg.message}\n` +
          (Object.keys(msg.metadata).length > 0 ? `Metadata: ${JSON.stringify(msg.metadata, null, 2)}\n` : '')
        ).join('\n---\n')
      : 'No messages found matching your filters.';

    return {
      content: [
        {
          type: 'text',
          text: `🍄 **Mycelium Network Messages**\n\n${messageText}\n\n*Retrieved ${messages.length} messages from ${hubUrl}*\n` +
                `*Filters: ${for_agent ? `for=${for_agent}` : ''} ${from_agent ? `from=${from_agent}` : ''} ${since ? `since=${since}` : ''}*`
        }
      ]
    };
  }

  async postMyceliumMessage(args) {
    const hubUrl = await this.getMemoryHubUrl();
    const { from, to = 'all', message, memory_type = 'message', metadata = {} } = args;

    const payload = {
      from,
      to,
      message,
      memory_type,
      metadata,
      projectId: 'mycelium-network'
    };

    const response = await axios.post(`${hubUrl}/api/mycelium/messages`, payload);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Message Posted to Mycelium Network**\n\n` +
               `- **From:** ${from}\n` +
               `- **To:** ${to}\n` +
               `- **Type:** ${memory_type}\n` +
               `- **Message ID:** ${response.data.message_id}\n` +
               `- **Timestamp:** ${response.data.timestamp}\n\n` +
               `Your message has been broadcast to the Mycelium Network and is now readable by other AIs!`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SCRI Memory Hub MCP Server running...');
  }
}

// Start the server
if (require.main === module) {
  const server = new SCRIMemoryHubMCPServer();
  server.run().catch(console.error);
}

module.exports = { SCRIMemoryHubMCPServer };
