// Federation Hub v2 - Rate Limiter Service
// Task 19: Rate Limiting Implementation
// Requirements: 13.1-13.7

const { v4: uuidv4 } = require('uuid');

class FederationRateLimiter {
  constructor(federationHub) {
    this.hub = federationHub;
    
    // Default limits
    this.defaultLimits = {
      requests_per_minute: 1000,
      bandwidth_mb_per_minute: 100,
      websocket_messages_per_minute: 500
    };
    
    // Custom limits per node (tier-based)
    this.nodeLimits = new Map();
    
    // Usage tracking
    this.usage = new Map();
    
    // Warning threshold (80%)
    this.warningThreshold = 0.8;
    
    // Reset interval
    this.resetInterval = null;
  }

  async initialize() {
    // Start usage reset job (every minute)
    this.startResetJob();
    console.log('⏱️ Rate Limiter service initialized');
  }

  // Set custom limits for a node (Requirement 13.5)
  setNodeLimits(nodeId, limits) {
    this.nodeLimits.set(nodeId, {
      requests_per_minute: limits.requests_per_minute || this.defaultLimits.requests_per_minute,
      bandwidth_mb_per_minute: limits.bandwidth_mb_per_minute || this.defaultLimits.bandwidth_mb_per_minute,
      websocket_messages_per_minute: limits.websocket_messages_per_minute || this.defaultLimits.websocket_messages_per_minute
    });
  }

  // Get limits for a node
  getLimits(nodeId) {
    return this.nodeLimits.get(nodeId) || this.defaultLimits;
  }

  // Get or create usage tracker for a node
  getUsage(nodeId) {
    if (!this.usage.has(nodeId)) {
      this.usage.set(nodeId, {
        requests: 0,
        bandwidth_bytes: 0,
        websocket_messages: 0,
        window_start: Date.now()
      });
    }
    return this.usage.get(nodeId);
  }

  // Requirement 13.1: Check request rate limit
  checkRequestLimit(nodeId) {
    const limits = this.getLimits(nodeId);
    const usage = this.getUsage(nodeId);
    
    if (usage.requests >= limits.requests_per_minute) {
      return {
        allowed: false,
        error: 'rate_limit_exceeded',
        limit_type: 'requests',
        retry_after: this.getRetryAfter(usage.window_start)
      };
    }

    // Check warning threshold (Requirement 13.6)
    const usageRatio = usage.requests / limits.requests_per_minute;
    if (usageRatio >= this.warningThreshold && usageRatio < 1) {
      this.emitWarning(nodeId, 'requests', usageRatio);
    }

    return { allowed: true };
  }

  // Requirement 13.2: Check bandwidth limit
  checkBandwidthLimit(nodeId, bytesToTransfer) {
    const limits = this.getLimits(nodeId);
    const usage = this.getUsage(nodeId);
    const limitBytes = limits.bandwidth_mb_per_minute * 1024 * 1024;
    
    if (usage.bandwidth_bytes + bytesToTransfer > limitBytes) {
      return {
        allowed: false,
        error: 'bandwidth_limit_exceeded',
        limit_type: 'bandwidth',
        retry_after: this.getRetryAfter(usage.window_start)
      };
    }

    // Check warning threshold
    const usageRatio = usage.bandwidth_bytes / limitBytes;
    if (usageRatio >= this.warningThreshold && usageRatio < 1) {
      this.emitWarning(nodeId, 'bandwidth', usageRatio);
    }

    return { allowed: true };
  }

  // Requirement 13.3: Check WebSocket message limit
  checkWebSocketLimit(nodeId) {
    const limits = this.getLimits(nodeId);
    const usage = this.getUsage(nodeId);
    
    if (usage.websocket_messages >= limits.websocket_messages_per_minute) {
      return {
        allowed: false,
        error: 'websocket_limit_exceeded',
        limit_type: 'websocket',
        retry_after: this.getRetryAfter(usage.window_start)
      };
    }

    // Check warning threshold
    const usageRatio = usage.websocket_messages / limits.websocket_messages_per_minute;
    if (usageRatio >= this.warningThreshold && usageRatio < 1) {
      this.emitWarning(nodeId, 'websocket', usageRatio);
    }

    return { allowed: true };
  }

  // Record request
  recordRequest(nodeId) {
    const usage = this.getUsage(nodeId);
    usage.requests++;
  }

  // Record bandwidth usage
  recordBandwidth(nodeId, bytes) {
    const usage = this.getUsage(nodeId);
    usage.bandwidth_bytes += bytes;
  }

  // Record WebSocket message
  recordWebSocketMessage(nodeId) {
    const usage = this.getUsage(nodeId);
    usage.websocket_messages++;
  }

  // Requirement 13.4: Calculate retry_after
  getRetryAfter(windowStart) {
    const windowEnd = windowStart + 60000; // 1 minute window
    const now = Date.now();
    return Math.max(0, Math.ceil((windowEnd - now) / 1000));
  }

  // Requirement 13.6: Emit warning at 80% threshold
  async emitWarning(nodeId, limitType, usageRatio) {
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'rate_limit.warning',
        source_node: nodeId,
        data: {
          node_id: nodeId,
          limit_type: limitType,
          usage_percent: Math.round(usageRatio * 100),
          threshold_percent: Math.round(this.warningThreshold * 100)
        }
      });
    }
  }

  // Requirement 13.7: Get usage for a node
  getNodeUsage(nodeId) {
    const limits = this.getLimits(nodeId);
    const usage = this.getUsage(nodeId);
    const limitBytes = limits.bandwidth_mb_per_minute * 1024 * 1024;

    return {
      node_id: nodeId,
      requests: {
        used: usage.requests,
        limit: limits.requests_per_minute,
        percent: Math.round((usage.requests / limits.requests_per_minute) * 100)
      },
      bandwidth: {
        used_bytes: usage.bandwidth_bytes,
        limit_bytes: limitBytes,
        percent: Math.round((usage.bandwidth_bytes / limitBytes) * 100)
      },
      websocket: {
        used: usage.websocket_messages,
        limit: limits.websocket_messages_per_minute,
        percent: Math.round((usage.websocket_messages / limits.websocket_messages_per_minute) * 100)
      },
      window_resets_in: this.getRetryAfter(usage.window_start)
    };
  }

  // Get all usage stats
  getAllUsage() {
    const stats = [];
    for (const [nodeId] of this.usage) {
      stats.push(this.getNodeUsage(nodeId));
    }
    return stats;
  }

  // Reset usage counters (runs every minute)
  startResetJob() {
    this.resetInterval = setInterval(() => {
      const now = Date.now();
      for (const [nodeId, usage] of this.usage) {
        // Reset if window has passed
        if (now - usage.window_start >= 60000) {
          this.usage.set(nodeId, {
            requests: 0,
            bandwidth_bytes: 0,
            websocket_messages: 0,
            window_start: now
          });
        }
      }
    }, 10000); // Check every 10 seconds
  }

  stopResetJob() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }
  }

  // Express middleware for rate limiting
  middleware() {
    return (req, res, next) => {
      const nodeId = req.headers['x-node-id'] || req.ip;
      
      const check = this.checkRequestLimit(nodeId);
      if (!check.allowed) {
        // Requirement 13.4: Return 429 with retry_after
        res.set('Retry-After', check.retry_after);
        return res.status(429).json({
          error: check.error,
          retry_after: check.retry_after
        });
      }

      this.recordRequest(nodeId);
      next();
    };
  }
}

module.exports = FederationRateLimiter;
