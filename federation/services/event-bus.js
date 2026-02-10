// Federation Hub v2 - Event Bus Service
// Task 11: P1 Event Bus Implementation
// Requirements: 7.1-7.6

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class FederationEventBus {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.io = federationHub.io;
    this.isProduction = federationHub.db.isProduction;
    
    // In-memory subscriptions cache
    this.subscriptions = new Map();
  }

  async initialize() {
    console.log('📡 Initializing Event Bus...');
    await this.loadSubscriptions();
    console.log('✅ Event Bus initialized');
  }

  async loadSubscriptions() {
    const query = 'SELECT * FROM federation_event_subscriptions WHERE active = true';
    
    try {
      if (this.isProduction) {
        const result = await this.db.db.query(query);
        result.rows.forEach(row => {
          this.subscriptions.set(row.id, this.parseSubscription(row));
        });
      } else {
        return new Promise((resolve, reject) => {
          this.db.db.all(query, [], (err, rows) => {
            if (err) reject(err);
            else {
              (rows || []).forEach(row => {
                this.subscriptions.set(row.id, this.parseSubscription(row));
              });
              resolve();
            }
          });
        });
      }
    } catch (error) {
      // Table might not exist yet
      console.log('⚠️ Event subscriptions table not ready yet');
    }
  }

  parseSubscription(row) {
    return {
      ...row,
      events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
      filter: typeof row.filter === 'string' ? JSON.parse(row.filter || '{}') : row.filter,
      active: row.active === 1 || row.active === true
    };
  }

  // Requirement 7.1: Subscribe to events with wildcard support
  async subscribe(subscription) {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const sub = {
      id,
      subscriber: subscription.subscriber,
      events: subscription.events || ['*'],
      filter: subscription.filter || {},
      channel: subscription.channel || 'websocket',
      webhook_url: subscription.webhook_url,
      webhook_secret: subscription.webhook_secret || crypto.randomBytes(32).toString('hex'),
      active: true,
      created_at: now
    };
    
    // Store in database
    await this.storeSubscription(sub);
    
    // Add to cache
    this.subscriptions.set(id, sub);
    
    return id;
  }

  async storeSubscription(sub) {
    const query = this.isProduction ?
      `INSERT INTO federation_event_subscriptions (id, subscriber, events, filter, channel, webhook_url, webhook_secret, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)` :
      `INSERT INTO federation_event_subscriptions (id, subscriber, events, filter, channel, webhook_url, webhook_secret, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      sub.id,
      sub.subscriber,
      JSON.stringify(sub.events),
      JSON.stringify(sub.filter),
      sub.channel,
      sub.webhook_url,
      sub.webhook_secret,
      sub.active ? 1 : 0,
      sub.created_at
    ];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Unsubscribe
  async unsubscribe(subscriptionId) {
    this.subscriptions.delete(subscriptionId);
    
    const query = this.isProduction ?
      `UPDATE federation_event_subscriptions SET active = false WHERE id = $1` :
      `UPDATE federation_event_subscriptions SET active = 0 WHERE id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [subscriptionId]);
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.run(query, [subscriptionId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Requirement 7.2: Emit event to matching subscribers
  async emit(event) {
    const federationEvent = {
      event_type: event.event_type,
      source_node: event.source_node,
      data: event.data,
      timestamp: new Date().toISOString()
    };
    
    // Find matching subscribers
    for (const [id, subscription] of this.subscriptions) {
      if (!subscription.active) continue;
      
      if (this.matchesSubscription(federationEvent, subscription)) {
        await this.deliverEvent(federationEvent, subscription);
      }
    }
    
    // Also broadcast via WebSocket to federation room
    if (this.io) {
      this.io.to('federation').emit('federation:event', federationEvent);
    }
  }

  // Check if event matches subscription patterns
  matchesSubscription(event, subscription) {
    // Check event type patterns (Requirement 7.1 - wildcard support)
    const eventType = event.event_type;
    const patterns = subscription.events;
    
    const matches = patterns.some(pattern => {
      if (pattern === '*') return true;
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        return eventType.startsWith(prefix);
      }
      return eventType === pattern;
    });
    
    if (!matches) return false;
    
    // Check node filter
    if (subscription.filter?.node_id) {
      const allowedNodes = subscription.filter.node_id;
      if (!allowedNodes.includes(event.source_node)) {
        return false;
      }
    }
    
    return true;
  }

  // Requirement 7.3, 7.4: Deliver event via WebSocket or webhook
  async deliverEvent(event, subscription) {
    if (subscription.channel === 'websocket') {
      // Deliver via WebSocket
      const wsPool = this.hub.webSocketPool;
      if (wsPool) {
        await wsPool.sendToNode(subscription.subscriber, {
          type: 'event',
          ...event
        });
      }
    } else if (subscription.channel === 'webhook' && subscription.webhook_url) {
      // Deliver via webhook with signature (Requirement 7.4)
      await this.deliverWebhook(event, subscription);
    }
  }

  // Deliver webhook with signature
  async deliverWebhook(event, subscription) {
    try {
      const payload = JSON.stringify(event);
      const signature = this.signPayload(payload, subscription.webhook_secret);
      
      const response = await fetch(subscription.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Federation-Signature': signature,
          'X-Federation-Event': event.event_type
        },
        body: payload
      });
      
      if (!response.ok) {
        console.error(`Webhook delivery failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Webhook delivery error: ${error.message}`);
    }
  }

  // Sign payload for webhook verification
  signPayload(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Requirement 7.5: Broadcast event to targets
  async broadcast(fromNode, eventType, data, target) {
    const event = {
      event_type: eventType,
      source_node: fromNode,
      data,
      timestamp: new Date().toISOString()
    };
    
    if (target === 'all' || !target) {
      // Broadcast to all nodes
      if (this.io) {
        this.io.to('federation').emit('federation:broadcast', event);
      }
    } else if (Array.isArray(target)) {
      // Send to specific nodes
      const wsPool = this.hub.webSocketPool;
      if (wsPool) {
        for (const nodeId of target) {
          await wsPool.sendToNode(nodeId, { type: 'broadcast', ...event });
        }
      }
    } else {
      // Single target
      const wsPool = this.hub.webSocketPool;
      if (wsPool) {
        await wsPool.sendToNode(target, { type: 'broadcast', ...event });
      }
    }
  }

  // Get subscriptions for a subscriber
  async getSubscriptions(subscriber) {
    return Array.from(this.subscriptions.values())
      .filter(s => s.subscriber === subscriber && s.active);
  }
}

module.exports = FederationEventBus;
