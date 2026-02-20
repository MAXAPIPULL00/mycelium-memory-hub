// Federation Hub v2 - WebSocket Pool Service
// Task 2: P0 WebSocket Pool Implementation
// Requirements: 1.1-1.8

const { v4: uuidv4 } = require('uuid');

class FederationWebSocketPool {
  constructor(federationHub) {
    this.hub = federationHub;
    this.io = federationHub.io;
    
    // Connection tracking
    this.connections = new Map(); // nodeId -> { socket, authenticated, channels, lastHeartbeat, sessionState }
    this.socketToNode = new Map(); // socketId -> nodeId
    this.channels = new Map(); // channelName -> Set of nodeIds
    
    // Session state for reconnection (5 minute TTL)
    this.sessionStates = new Map(); // nodeId -> { reconnectToken, pendingMessages, expiresAt }
    
    // Heartbeat tracking
    this.heartbeatInterval = null;
    this.HEARTBEAT_TIMEOUT_MS = 90000; // 90 seconds
    this.SESSION_TTL_MS = 300000; // 5 minutes
  }

  async initialize() {
    console.log('🔌 Initializing WebSocket Pool...');
    
    // Start heartbeat checker
    this.heartbeatInterval = setInterval(() => {
      this.checkStaleConnections();
      this.cleanupExpiredSessions();
    }, 30000); // Check every 30 seconds
    
    console.log('✅ WebSocket Pool initialized');
  }

  // Requirement 1.1, 1.2: Handle node registration with authentication
  async handleNodeRegistration(socket, data) {
    const { node_id, auth_token, signature } = data;
    
    try {
      // Validate authentication (Requirement 1.1)
      const authResult = await this.authenticateConnection(node_id, auth_token, signature);
      
      if (!authResult.success) {
        socket.emit('federation:auth-failed', { error: authResult.error });
        return;
      }
      
      // Check for existing session to restore
      const existingSession = this.sessionStates.get(node_id);
      let pendingMessages = [];
      
      if (existingSession && existingSession.expiresAt > Date.now()) {
        pendingMessages = existingSession.pendingMessages || [];
        this.sessionStates.delete(node_id);
      }
      
      // Store connection
      const connection = {
        socket,
        authenticated: true,
        channels: new Set(),
        lastHeartbeat: Date.now(),
        sessionState: {
          nodeId: node_id,
          connectedAt: new Date(),
          reconnectToken: uuidv4()
        }
      };
      
      this.connections.set(node_id, connection);
      this.socketToNode.set(socket.id, node_id);
      
      // Join federation room
      socket.join('federation');
      
      // Get connected nodes list
      const connectedNodes = Array.from(this.connections.keys()).filter(id => id !== node_id);
      
      // Send confirmation (Requirement 1.2)
      socket.emit('federation:connected', {
        federation_id: 'scri-federation',
        connected_nodes: connectedNodes,
        subscribed_channels: [],
        reconnect_token: connection.sessionState.reconnectToken,
        pending_messages: pendingMessages.length
      });
      
      // Deliver pending messages
      for (const msg of pendingMessages) {
        socket.emit('federation:message', msg);
      }
      
      // Notify other nodes
      socket.broadcast.to('federation').emit('federation:node-joined', {
        node_id,
        timestamp: new Date().toISOString()
      });
      
      // Emit event
      if (this.hub.eventBus) {
        await this.hub.eventBus.emit({
          event_type: 'federation.node.connected',
          source_node: node_id,
          data: { node_id }
        });
      }
      
      console.log(`✅ Node '${node_id}' connected to federation`);
      
    } catch (error) {
      console.error(`❌ Node registration failed for ${node_id}:`, error);
      socket.emit('federation:auth-failed', { error: error.message });
    }
  }

  // Authenticate connection using identity-auth service
  async authenticateConnection(nodeId, token, signature) {
    if (!nodeId || !token) {
      return { success: false, error: 'Missing node_id or auth_token' };
    }

    // Validate token via identity-auth service
    if (this.hub.identityAuth) {
      const tokenResult = this.hub.identityAuth.validateToken(token);
      if (!tokenResult.valid) {
        console.warn(`Auth failed for node '${nodeId}': ${tokenResult.error || 'invalid token'}`);
        return { success: false, error: tokenResult.error || 'Invalid auth token' };
      }

      // Verify the token belongs to the claimed node
      if (tokenResult.node_id && tokenResult.node_id !== nodeId) {
        console.warn(`Auth mismatch: token for '${tokenResult.node_id}' used by '${nodeId}'`);
        return { success: false, error: 'Token does not match node_id' };
      }

      // If signature provided, verify it
      if (signature) {
        const sigResult = this.hub.identityAuth.verifySignature(
          nodeId,
          `${nodeId}:${token}`,
          signature
        );
        if (!sigResult.valid) {
          console.warn(`Signature verification failed for node '${nodeId}'`);
          return { success: false, error: sigResult.error || 'Invalid signature' };
        }
      }

      return { success: true, node_id: tokenResult.node_id, scopes: tokenResult.scopes };
    }

    // Fallback: if identity-auth not initialized, allow with warning
    console.warn('WARNING: identity-auth not available, accepting connection without validation');
    return { success: true };
  }

  // Requirement 1.3: Handle channel subscription
  async handleSubscribe(socket, data) {
    const nodeId = this.socketToNode.get(socket.id);
    if (!nodeId) {
      socket.emit('federation:error', { error: 'Not authenticated' });
      return;
    }
    
    const { channels } = data;
    const connection = this.connections.get(nodeId);
    
    if (!connection) return;
    
    const subscribedChannels = [];
    
    for (const channel of channels) {
      // Add to channel set
      if (!this.channels.has(channel)) {
        this.channels.set(channel, new Set());
      }
      this.channels.get(channel).add(nodeId);
      connection.channels.add(channel);
      
      // Join socket.io room
      socket.join(`channel:${channel}`);
      subscribedChannels.push(channel);
    }
    
    socket.emit('federation:subscribed', {
      channels: subscribedChannels,
      timestamp: new Date().toISOString()
    });
  }

  // Unsubscribe from channels
  async handleUnsubscribe(socket, data) {
    const nodeId = this.socketToNode.get(socket.id);
    if (!nodeId) return;
    
    const { channels } = data;
    const connection = this.connections.get(nodeId);
    
    if (!connection) return;
    
    for (const channel of channels) {
      if (this.channels.has(channel)) {
        this.channels.get(channel).delete(nodeId);
      }
      connection.channels.delete(channel);
      socket.leave(`channel:${channel}`);
    }
    
    socket.emit('federation:unsubscribed', { channels });
  }

  // Requirement 1.4, 1.8: Handle message delivery
  async handleMessage(socket, data) {
    const nodeId = this.socketToNode.get(socket.id);
    if (!nodeId) {
      socket.emit('federation:error', { error: 'Not authenticated' });
      return;
    }
    
    const { type, channel, to_node, content, correlation_id } = data;
    
    const message = {
      type: type || 'message',
      from_node: nodeId,
      channel,
      content,
      correlation_id,
      timestamp: new Date().toISOString()
    };
    
    // Direct message to specific node
    if (to_node) {
      await this.sendToNode(to_node, message);
    }
    // Broadcast to channel
    else if (channel) {
      await this.broadcastToChannel(channel, message);
    }
    // Broadcast to all
    else {
      await this.broadcastToAll(message, nodeId);
    }
    
    socket.emit('federation:message-ack', {
      success: true,
      correlation_id,
      timestamp: message.timestamp
    });
  }

  // Send message to specific node
  async sendToNode(nodeId, message) {
    const connection = this.connections.get(nodeId);
    
    if (connection && connection.socket) {
      connection.socket.emit('federation:message', message);
    } else {
      // Queue for offline delivery (Requirement 15)
      await this.queueOfflineMessage(nodeId, message);
    }
  }

  // Requirement 1.4: Broadcast to channel subscribers
  async broadcastToChannel(channel, message) {
    const subscribers = this.channels.get(channel);
    if (!subscribers) return;
    
    for (const nodeId of subscribers) {
      if (nodeId !== message.from_node) {
        await this.sendToNode(nodeId, message);
      }
    }
  }

  // Broadcast to all connected nodes
  async broadcastToAll(message, excludeNode = null) {
    for (const [nodeId, connection] of this.connections) {
      if (nodeId !== excludeNode && connection.socket) {
        connection.socket.emit('federation:message', message);
      }
    }
  }

  // Requirement 1.5, 1.6: Handle heartbeat
  async handleHeartbeat(socket, data) {
    const nodeId = this.socketToNode.get(socket.id);
    if (!nodeId) return;
    
    const connection = this.connections.get(nodeId);
    if (!connection) return;
    
    connection.lastHeartbeat = Date.now();
    
    // Forward to node registry for processing
    if (this.hub.nodeRegistry) {
      await this.hub.nodeRegistry.processHeartbeat(nodeId, data);
    }
    
    socket.emit('federation:heartbeat-ack', {
      timestamp: new Date().toISOString()
    });
  }

  // Requirement 1.6: Check for stale connections
  checkStaleConnections() {
    const now = Date.now();
    
    for (const [nodeId, connection] of this.connections) {
      const timeSinceHeartbeat = now - connection.lastHeartbeat;
      
      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        console.log(`⚠️ Node '${nodeId}' heartbeat timeout (${Math.round(timeSinceHeartbeat / 1000)}s)`);
        this.handleNodeTimeout(nodeId);
      }
    }
  }

  // Handle node timeout
  async handleNodeTimeout(nodeId) {
    const connection = this.connections.get(nodeId);
    if (!connection) return;
    
    // Save session state for reconnection (Requirement 1.7)
    this.sessionStates.set(nodeId, {
      reconnectToken: connection.sessionState.reconnectToken,
      pendingMessages: [],
      expiresAt: Date.now() + this.SESSION_TTL_MS
    });
    
    // Clean up connection
    this.cleanupConnection(nodeId);
    
    // Mark node offline
    if (this.hub.nodeRegistry) {
      await this.hub.nodeRegistry.markNodeOffline(nodeId);
    }
    
    // Notify other nodes
    this.io.to('federation').emit('federation:node-left', {
      node_id: nodeId,
      reason: 'heartbeat_timeout',
      timestamp: new Date().toISOString()
    });
  }

  // Handle disconnect
  handleDisconnect(socket) {
    const nodeId = this.socketToNode.get(socket.id);
    if (!nodeId) return;
    
    const connection = this.connections.get(nodeId);
    if (!connection) return;
    
    console.log(`🔌 Node '${nodeId}' disconnected`);
    
    // Save session state for reconnection (Requirement 1.7)
    this.sessionStates.set(nodeId, {
      reconnectToken: connection.sessionState.reconnectToken,
      pendingMessages: [],
      expiresAt: Date.now() + this.SESSION_TTL_MS
    });
    
    this.cleanupConnection(nodeId);
    
    // Notify other nodes
    this.io.to('federation').emit('federation:node-left', {
      node_id: nodeId,
      reason: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }

  // Clean up connection
  cleanupConnection(nodeId) {
    const connection = this.connections.get(nodeId);
    if (!connection) return;
    
    // Remove from channels
    for (const channel of connection.channels) {
      if (this.channels.has(channel)) {
        this.channels.get(channel).delete(nodeId);
      }
    }
    
    // Remove from maps
    this.socketToNode.delete(connection.socket.id);
    this.connections.delete(nodeId);
  }

  // Queue message for offline node (in-memory + database persistence)
  async queueOfflineMessage(nodeId, message) {
    const session = this.sessionStates.get(nodeId);
    if (session) {
      // Cap in-memory queue at 100 messages
      if (session.pendingMessages.length < 100) {
        session.pendingMessages.push(message);
      }
    }

    // Persist to database for longer-term storage
    try {
      await this.db.run(`
        INSERT INTO federation_pending_messages
        (node_id, message_data, created_at)
        VALUES (?, ?, ?)
      `, [nodeId, JSON.stringify(message), new Date().toISOString()]);
    } catch (error) {
      // Table may not exist yet — log and continue
      console.log(`⚠️ Could not persist offline message for ${nodeId}: ${error.message}`);
    }
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    
    for (const [nodeId, session] of this.sessionStates) {
      if (session.expiresAt < now) {
        this.sessionStates.delete(nodeId);
      }
    }
  }

  // Get connection count
  getConnectionCount() {
    return this.connections.size;
  }

  // Get connected node IDs
  getConnectedNodeIds() {
    return Array.from(this.connections.keys());
  }

  // Shutdown
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

module.exports = FederationWebSocketPool;
