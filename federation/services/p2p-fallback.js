// Federation Hub v2 - P2P Fallback Service
// Task 25: P2P Fallback Implementation
// Requirements: 19.1-19.5

const http = require('http');
const https = require('https');

class FederationP2PFallback {
  constructor(federationHub) {
    this.hub = federationHub;
    
    // Direct endpoint cache
    this.directEndpoints = new Map(); // nodeId -> { endpoint, lastProbe, reachable }
    
    // Probe interval: 5 minutes
    this.probeIntervalMs = 5 * 60 * 1000;
    
    // Probe timeout: 5 seconds
    this.probeTimeout = 5000;
    
    // Probe job
    this.probeInterval = null;
  }

  async initialize() {
    // Start connectivity probing
    this.startProbing();
    console.log('🔀 P2P Fallback service initialized');
  }

  // Requirement 19.1: Register direct endpoint
  registerDirectEndpoint(nodeId, endpoint) {
    this.directEndpoints.set(nodeId, {
      endpoint,
      lastProbe: null,
      reachable: null,
      latency: null
    });
  }

  // Get direct endpoint for a node
  getDirectEndpoint(nodeId) {
    const entry = this.directEndpoints.get(nodeId);
    return entry?.endpoint || null;
  }

  // Requirement 19.3: Probe connectivity every 5 minutes
  startProbing() {
    this.probeInterval = setInterval(async () => {
      await this.probeAllEndpoints();
    }, this.probeIntervalMs);

    // Run initial probe
    this.probeAllEndpoints();
  }

  stopProbing() {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
      this.probeInterval = null;
    }
  }

  async probeAllEndpoints() {
    for (const [nodeId, entry] of this.directEndpoints) {
      await this.probeEndpoint(nodeId, entry.endpoint);
    }
  }

  async probeEndpoint(nodeId, endpoint) {
    const entry = this.directEndpoints.get(nodeId);
    if (!entry) return;

    const startTime = Date.now();
    
    try {
      const reachable = await this.checkConnectivity(endpoint);
      const latency = Date.now() - startTime;

      entry.lastProbe = new Date().toISOString();
      entry.reachable = reachable;
      entry.latency = latency;

      this.directEndpoints.set(nodeId, entry);
    } catch (error) {
      entry.lastProbe = new Date().toISOString();
      entry.reachable = false;
      entry.latency = null;
      this.directEndpoints.set(nodeId, entry);
    }
  }

  async checkConnectivity(endpoint) {
    return new Promise((resolve) => {
      const url = new URL(endpoint);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/health',
        method: 'GET',
        timeout: this.probeTimeout
      }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  // Requirement 19.2: Route direct when possible
  async routeMessage(targetNode, message) {
    const entry = this.directEndpoints.get(targetNode);
    
    // Try direct routing if endpoint is known and reachable
    if (entry?.reachable) {
      const result = await this.sendDirect(targetNode, entry.endpoint, message);
      if (result.success) {
        return {
          ...result,
          routing_method: 'direct',
          latency: entry.latency
        };
      }
      // Requirement 19.4: Fallback to hub on failure
    }

    // Route through hub
    const result = await this.sendViaHub(targetNode, message);
    return {
      ...result,
      routing_method: 'hub'
    };
  }

  async sendDirect(nodeId, endpoint, message) {
    return new Promise((resolve) => {
      const url = new URL(endpoint);
      const client = url.protocol === 'https:' ? https : http;

      const postData = JSON.stringify(message);

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/api/federation/message',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, response: data });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'timeout' });
      });

      req.write(postData);
      req.end();
    });
  }

  async sendViaHub(targetNode, message) {
    // Use WebSocket pool to send through hub
    if (this.hub.webSocketPool) {
      try {
        await this.hub.webSocketPool.sendToNode(targetNode, message);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Hub not available' };
  }

  // Requirement 19.5: Get routing info
  getRoutingInfo(nodeId) {
    const entry = this.directEndpoints.get(nodeId);
    
    if (!entry) {
      return {
        node_id: nodeId,
        direct_available: false,
        routing_method: 'hub'
      };
    }

    return {
      node_id: nodeId,
      direct_available: entry.reachable === true,
      direct_endpoint: entry.endpoint,
      last_probe: entry.lastProbe,
      latency_ms: entry.latency,
      routing_method: entry.reachable ? 'direct' : 'hub'
    };
  }

  // Get all routing info
  getAllRoutingInfo() {
    const info = [];
    for (const [nodeId] of this.directEndpoints) {
      info.push(this.getRoutingInfo(nodeId));
    }
    return info;
  }

  // Get connectivity stats
  getStats() {
    let directReachable = 0;
    let directUnreachable = 0;
    let unknown = 0;

    for (const [, entry] of this.directEndpoints) {
      if (entry.reachable === true) directReachable++;
      else if (entry.reachable === false) directUnreachable++;
      else unknown++;
    }

    return {
      total_endpoints: this.directEndpoints.size,
      direct_reachable: directReachable,
      direct_unreachable: directUnreachable,
      unknown: unknown,
      probe_interval_ms: this.probeIntervalMs
    };
  }

  // Force probe a specific endpoint
  async forceProbe(nodeId) {
    const entry = this.directEndpoints.get(nodeId);
    if (!entry) {
      return { success: false, error: 'Endpoint not registered' };
    }

    await this.probeEndpoint(nodeId, entry.endpoint);
    return {
      success: true,
      ...this.getRoutingInfo(nodeId)
    };
  }

  // Remove endpoint
  removeEndpoint(nodeId) {
    return this.directEndpoints.delete(nodeId);
  }
}

module.exports = FederationP2PFallback;
