// SCRI Core Memory Hub - Redis Coordination Layer
// High-performance real-time AI-to-AI coordination using Upstash Redis

const fetch = require('node-fetch');

class RedisCoordinationLayer {
  constructor() {
    this.baseUrl = process.env.UPSTASH_REDIS_REST_URL;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!this.baseUrl || !this.token) {
      console.warn('⚠️  Upstash Redis not configured - real-time coordination disabled');
      this.enabled = false;
    } else {
      this.enabled = true;
      console.log('✅ Redis Coordination Layer initialized');
    }

    // Cache TTLs (in seconds)
    this.TTL = {
      AI_SESSION: 3600,        // 1 hour - active AI sessions
      MESSAGE_QUEUE: 300,      // 5 minutes - pending messages
      MEMORY_CACHE: 1800,      // 30 minutes - hot memory cache
      ENTITY_STATUS: 600,      // 10 minutes - entity heartbeats
      BROADCAST: 60            // 1 minute - broadcast messages
    };
  }

  /**
   * Execute Redis command via REST API
   */
  async execute(command, ...args) {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/${command}/${args.join('/')}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Redis error:', error.message);
      return null;
    }
  }

  /**
   * Execute Redis command with JSON body (for complex data)
   */
  async executePost(commands) {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Redis error:', error.message);
      return null;
    }
  }

  // ============================================
  // AI-TO-AI MESSAGING
  // ============================================

  /**
   * Send message from one AI to another
   */
  async sendAIMessage(from, to, message, priority = 'normal') {
    const messageId = `msg:${Date.now()}:${from}:${to}`;
    const messageData = JSON.stringify({
      id: messageId,
      from,
      to,
      message,
      priority,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    // Store in recipient's queue
    await this.execute('LPUSH', `queue:${to}`, messageData);
    await this.execute('EXPIRE', `queue:${to}`, this.TTL.MESSAGE_QUEUE);

    // Store in sent messages (for tracking)
    await this.execute('SETEX', messageId, this.TTL.MESSAGE_QUEUE, messageData);

    console.log(`📨 Redis: ${from} → ${to} (${priority})`);
    return messageId;
  }

  /**
   * Get pending messages for an AI
   */
  async getAIMessages(aiName, limit = 10) {
    const messages = [];

    for (let i = 0; i < limit; i++) {
      const message = await this.execute('RPOP', `queue:${aiName}`);
      if (!message) break;

      try {
        messages.push(JSON.parse(message));
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    }

    return messages;
  }

  /**
   * Broadcast message to multiple AIs
   */
  async broadcastToAIs(from, targetAIs, message, priority = 'normal') {
    const broadcastId = `broadcast:${Date.now()}:${from}`;

    const promises = targetAIs.map(ai =>
      this.sendAIMessage(from, ai, message, priority)
    );

    await Promise.all(promises);

    console.log(`📢 Redis Broadcast: ${from} → [${targetAIs.join(', ')}]`);
    return broadcastId;
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Register AI session
   */
  async registerAISession(aiName, platform, projectId, metadata = {}) {
    const sessionKey = `session:${aiName}`;
    const sessionData = JSON.stringify({
      aiName,
      platform,
      projectId,
      metadata,
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    });

    await this.execute('SETEX', sessionKey, this.TTL.AI_SESSION, sessionData);

    // Add to active sessions set
    await this.execute('SADD', 'active-sessions', aiName);

    console.log(`✅ Redis Session: ${aiName} registered`);
  }

  /**
   * Heartbeat - keep session alive
   */
  async heartbeat(aiName) {
    const sessionKey = `session:${aiName}`;
    const sessionData = await this.execute('GET', sessionKey);

    if (sessionData) {
      const session = JSON.parse(sessionData);
      session.lastHeartbeat = new Date().toISOString();
      await this.execute('SETEX', sessionKey, this.TTL.AI_SESSION, JSON.stringify(session));
      return true;
    }

    return false;
  }

  /**
   * Get all active AI sessions
   */
  async getActiveSessions() {
    const sessionNames = await this.execute('SMEMBERS', 'active-sessions');
    if (!sessionNames) return [];

    const sessions = [];
    for (const name of sessionNames) {
      const data = await this.execute('GET', `session:${name}`);
      if (data) {
        try {
          sessions.push(JSON.parse(data));
        } catch (e) {
          // Remove invalid session from set
          await this.execute('SREM', 'active-sessions', name);
        }
      } else {
        // Session expired, remove from set
        await this.execute('SREM', 'active-sessions', name);
      }
    }

    return sessions;
  }

  /**
   * Unregister AI session
   */
  async unregisterAISession(aiName) {
    await this.execute('DEL', `session:${aiName}`);
    await this.execute('SREM', 'active-sessions', aiName);
    console.log(`👋 Redis Session: ${aiName} unregistered`);
  }

  // ============================================
  // MEMORY CACHING
  // ============================================

  /**
   * Cache recent conversation
   */
  async cacheConversation(conversationId, data) {
    const key = `cache:conv:${conversationId}`;
    await this.execute('SETEX', key, this.TTL.MEMORY_CACHE, JSON.stringify(data));
  }

  /**
   * Get cached conversation
   */
  async getCachedConversation(conversationId) {
    const data = await this.execute('GET', `cache:conv:${conversationId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Cache project context (hot data)
   */
  async cacheProjectContext(projectId, context) {
    const key = `cache:project:${projectId}`;
    await this.execute('SETEX', key, this.TTL.MEMORY_CACHE, JSON.stringify(context));
  }

  /**
   * Get cached project context
   */
  async getCachedProjectContext(projectId) {
    const data = await this.execute('GET', `cache:project:${projectId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Cache AI insight (for fast retrieval)
   */
  async cacheInsight(insightId, insight) {
    const key = `cache:insight:${insightId}`;
    await this.execute('SETEX', key, this.TTL.MEMORY_CACHE, JSON.stringify(insight));
  }

  // ============================================
  // ENTITY STATUS TRACKING
  // ============================================

  /**
   * Update entity heartbeat
   */
  async updateEntityStatus(entityName, status, metadata = {}) {
    const key = `entity:${entityName}`;
    const data = JSON.stringify({
      entityName,
      status,
      metadata,
      updatedAt: new Date().toISOString()
    });

    await this.execute('SETEX', key, this.TTL.ENTITY_STATUS, data);
    await this.execute('SADD', 'active-entities', entityName);
  }

  /**
   * Get all active entities
   */
  async getActiveEntities() {
    const entityNames = await this.execute('SMEMBERS', 'active-entities');
    if (!entityNames) return [];

    const entities = [];
    for (const name of entityNames) {
      const data = await this.execute('GET', `entity:${name}`);
      if (data) {
        entities.push(JSON.parse(data));
      } else {
        await this.execute('SREM', 'active-entities', name);
      }
    }

    return entities;
  }

  /**
   * Check if entity is online
   */
  async isEntityOnline(entityName) {
    const data = await this.execute('GET', `entity:${entityName}`);
    return data !== null;
  }

  // ============================================
  // REAL-TIME COORDINATION
  // ============================================

  /**
   * Publish event to channel (pub/sub simulation via lists)
   */
  async publishEvent(channel, event, data) {
    const eventData = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString()
    });

    await this.execute('LPUSH', `channel:${channel}`, eventData);
    await this.execute('LTRIM', `channel:${channel}`, 0, 99); // Keep last 100 events
    await this.execute('EXPIRE', `channel:${channel}`, this.TTL.BROADCAST);
  }

  /**
   * Get recent events from channel
   */
  async getChannelEvents(channel, limit = 10) {
    const events = await this.execute('LRANGE', `channel:${channel}`, 0, limit - 1);
    if (!events) return [];

    return events.map(e => {
      try {
        return JSON.parse(e);
      } catch (err) {
        return null;
      }
    }).filter(e => e !== null);
  }

  // ============================================
  // STATISTICS & MONITORING
  // ============================================

  /**
   * Increment counter with expiry
   */
  async incrementCounter(key, ttl = 3600) {
    await this.execute('INCR', `counter:${key}`);
    await this.execute('EXPIRE', `counter:${key}`, ttl);
  }

  /**
   * Get counter value
   */
  async getCounter(key) {
    const value = await this.execute('GET', `counter:${key}`);
    return value ? parseInt(value) : 0;
  }

  /**
   * Get coordination layer stats
   */
  async getStats() {
    const [activeSessions, activeEntities, messageQueueKeys] = await Promise.all([
      this.execute('SCARD', 'active-sessions'),
      this.execute('SCARD', 'active-entities'),
      this.execute('KEYS', 'queue:*')
    ]);

    return {
      enabled: this.enabled,
      activeSessions: activeSessions || 0,
      activeEntities: activeEntities || 0,
      messageQueues: messageQueueKeys ? messageQueueKeys.length : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear all cached data (maintenance)
   */
  async clearCache() {
    const cacheKeys = await this.execute('KEYS', 'cache:*');
    if (cacheKeys && cacheKeys.length > 0) {
      for (const key of cacheKeys) {
        await this.execute('DEL', key);
      }
    }
    console.log(`🧹 Redis cache cleared (${cacheKeys?.length || 0} keys)`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.enabled) {
      return { status: 'disabled' };
    }

    try {
      const timestamp = Date.now();
      await this.execute('SET', 'health-check', timestamp);
      const retrieved = await this.execute('GET', 'health-check');

      return {
        status: retrieved == timestamp ? 'healthy' : 'degraded',
        latency: Date.now() - timestamp,
        enabled: true
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        enabled: true
      };
    }
  }
}

module.exports = RedisCoordinationLayer;
