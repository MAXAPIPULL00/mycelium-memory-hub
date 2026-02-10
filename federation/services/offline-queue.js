// Federation Hub v2 - Offline Queue Service
// Task 21: Offline Message Queue Implementation
// Requirements: 15.1-15.7

const { v4: uuidv4 } = require('uuid');

class FederationOfflineQueue {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // Max pending messages per recipient (Requirement 15.5)
    this.maxPendingPerRecipient = 1000;
    
    // In-memory queue for fast access
    this.queues = new Map();
  }

  async initialize() {
    await this.loadQueues();
    console.log('📬 Offline Queue service initialized');
  }

  async loadQueues() {
    try {
      const messages = await this.db.all(`
        SELECT * FROM federation_offline_queue ORDER BY queued_at ASC
      `);

      for (const msg of messages || []) {
        if (!this.queues.has(msg.recipient_node)) {
          this.queues.set(msg.recipient_node, []);
        }
        this.queues.get(msg.recipient_node).push({
          queue_id: msg.queue_id,
          message_id: msg.message_id,
          from_node: msg.from_node,
          recipient_node: msg.recipient_node,
          content: msg.content,
          content_type: msg.content_type,
          expires_at: msg.expires_at,
          queued_at: msg.queued_at
        });
      }
    } catch (error) {
      console.log('⚠️ Offline queue table not ready');
    }
  }

  // Requirement 15.1: Queue message for offline node
  async queueMessage(message) {
    const { from_node, recipient_node, content, content_type, ttl_seconds } = message;

    // Check queue limit (Requirement 15.5)
    const currentCount = await this.getQueueCount(recipient_node);
    if (currentCount >= this.maxPendingPerRecipient) {
      // Requirement 15.6: Reject when full
      return {
        success: false,
        error: 'queue_full',
        message: `Queue for ${recipient_node} is full (${this.maxPendingPerRecipient} messages)`
      };
    }

    const queueId = uuidv4();
    const messageId = message.message_id || uuidv4();
    const now = new Date();
    const expiresAt = ttl_seconds 
      ? new Date(now.getTime() + ttl_seconds * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days default

    const queuedMessage = {
      queue_id: queueId,
      message_id: messageId,
      from_node,
      recipient_node,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      content_type: content_type || 'application/json',
      expires_at: expiresAt.toISOString(),
      queued_at: now.toISOString()
    };

    // Add to in-memory queue
    if (!this.queues.has(recipient_node)) {
      this.queues.set(recipient_node, []);
    }
    this.queues.get(recipient_node).push(queuedMessage);

    // Persist to database
    try {
      await this.db.run(`
        INSERT INTO federation_offline_queue 
        (queue_id, message_id, from_node, recipient_node, content, content_type, expires_at, queued_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        queuedMessage.queue_id,
        queuedMessage.message_id,
        queuedMessage.from_node,
        queuedMessage.recipient_node,
        queuedMessage.content,
        queuedMessage.content_type,
        queuedMessage.expires_at,
        queuedMessage.queued_at
      ]);
    } catch (error) {
      console.error('Failed to queue message:', error);
    }

    // Requirement 15.7: Emit messages_pending event
    await this.emitPendingEvent(recipient_node);

    return {
      success: true,
      queue_id: queueId,
      message_id: messageId,
      expires_at: queuedMessage.expires_at
    };
  }

  // Requirement 15.2: Deliver messages on reconnection (in order)
  async deliverPendingMessages(nodeId) {
    const queue = this.queues.get(nodeId) || [];
    const delivered = [];
    const expired = [];
    const now = new Date();

    // Sort by queued_at to maintain order
    queue.sort((a, b) => new Date(a.queued_at) - new Date(b.queued_at));

    for (const msg of queue) {
      // Requirement 15.3: Don't deliver expired messages
      if (new Date(msg.expires_at) < now) {
        expired.push(msg.queue_id);
        continue;
      }

      // Deliver via WebSocket
      if (this.hub.webSocketPool) {
        await this.hub.webSocketPool.sendToNode(nodeId, {
          type: 'queued_message',
          message_id: msg.message_id,
          from_node: msg.from_node,
          content: msg.content,
          content_type: msg.content_type,
          queued_at: msg.queued_at
        });
      }

      delivered.push(msg.queue_id);
    }

    // Remove delivered and expired messages
    const toRemove = [...delivered, ...expired];
    for (const queueId of toRemove) {
      await this.removeFromQueue(queueId);
    }

    // Update in-memory queue
    this.queues.set(nodeId, queue.filter(m => !toRemove.includes(m.queue_id)));

    return {
      delivered: delivered.length,
      expired: expired.length,
      remaining: (this.queues.get(nodeId) || []).length
    };
  }

  // Remove message from queue
  async removeFromQueue(queueId) {
    try {
      await this.db.run(`DELETE FROM federation_offline_queue WHERE queue_id = ?`, [queueId]);
    } catch (error) {
      console.error('Failed to remove from queue:', error);
    }
  }

  // Get queue count for a recipient
  async getQueueCount(nodeId) {
    const queue = this.queues.get(nodeId);
    return queue ? queue.length : 0;
  }

  // Requirement 15.4: Get pending status
  async getPendingStatus(nodeId) {
    const queue = this.queues.get(nodeId) || [];
    let totalSize = 0;

    for (const msg of queue) {
      totalSize += Buffer.byteLength(msg.content, 'utf8');
    }

    return {
      node_id: nodeId,
      pending_count: queue.length,
      total_size_bytes: totalSize,
      oldest_message: queue.length > 0 ? queue[0].queued_at : null,
      newest_message: queue.length > 0 ? queue[queue.length - 1].queued_at : null
    };
  }

  // Get all pending statuses
  async getAllPendingStatus() {
    const statuses = [];
    for (const [nodeId] of this.queues) {
      statuses.push(await this.getPendingStatus(nodeId));
    }
    return statuses;
  }

  // Requirement 15.7: Emit messages_pending event
  async emitPendingEvent(nodeId) {
    const status = await this.getPendingStatus(nodeId);
    
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'messages.pending',
        data: status
      });
    }
  }

  // Purge expired messages
  async purgeExpired() {
    const now = new Date().toISOString();
    let purgedCount = 0;

    for (const [nodeId, queue] of this.queues) {
      const validMessages = queue.filter(msg => msg.expires_at > now);
      purgedCount += queue.length - validMessages.length;
      this.queues.set(nodeId, validMessages);
    }

    try {
      await this.db.run(`
        DELETE FROM federation_offline_queue WHERE expires_at < ?
      `, [now]);
    } catch (error) {
      // Table may not exist
    }

    return purgedCount;
  }
}

module.exports = FederationOfflineQueue;
