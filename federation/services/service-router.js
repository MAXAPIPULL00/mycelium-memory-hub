// Federation Hub v2 - Service Router
// Task 8: P1 Service Router Implementation
// Requirements: 4.1-4.6

const { v4: uuidv4 } = require('uuid');

class FederationServiceRouter {
  constructor(federationHub) {
    this.hub = federationHub;
    this.defaultTimeout = 30000; // 30 seconds
  }

  // Requirement 4.1: Discover service across nodes
  async discoverService(serviceName) {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) return { service: serviceName, available_on: [] };
    
    const nodes = Array.from(nodeRegistry.nodes.values());
    const instances = [];
    
    for (const node of nodes) {
      const service = node.services?.[serviceName];
      if (service) {
        instances.push({
          node_id: node.id,
          port: service.port,
          version: service.version,
          status: service.status,
          direct_url: this.getDirectUrl(node, service),
          proxy_available: node.status === 'online'
        });
      }
    }
    
    return { service: serviceName, available_on: instances };
  }

  // Requirement 4.5: Discover by capability
  async discoverByCapability(capability) {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) return [];
    
    const nodes = await nodeRegistry.findNodesByCapability(capability);
    const results = [];
    
    for (const nodeSummary of nodes) {
      const node = nodeRegistry.nodes.get(nodeSummary.node_id);
      if (!node) continue;
      
      for (const [serviceName, service] of Object.entries(node.services || {})) {
        results.push({
          service: serviceName,
          node_id: node.id,
          port: service.port,
          version: service.version,
          status: service.status,
          capabilities: node.capabilities
        });
      }
    }
    
    return results;
  }

  // Requirement 4.2, 4.3: Proxy request to target node
  async proxyRequest(request) {
    const { from_node, to_node, service, method, path, headers, body, timeout_ms } = request;
    const startTime = Date.now();
    
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) {
      return this.createErrorResponse(503, 'Node registry not available', startTime);
    }
    
    const targetNode = nodeRegistry.nodes.get(to_node);
    if (!targetNode) {
      return this.createErrorResponse(404, `Node '${to_node}' not found`, startTime, await this.getAlternatives(service));
    }
    
    // Requirement 4.4: Check if node is reachable
    if (targetNode.status !== 'online') {
      return this.createErrorResponse(502, `Node '${to_node}' is offline`, startTime, await this.getAlternatives(service));
    }
    
    const serviceInfo = targetNode.services?.[service];
    if (!serviceInfo) {
      return this.createErrorResponse(404, `Service '${service}' not found on node '${to_node}'`, startTime);
    }
    
    // Build target URL
    const targetUrl = this.buildTargetUrl(targetNode, serviceInfo, path);
    
    try {
      // Requirement 4.6: Enforce timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout_ms || this.defaultTimeout);
      
      const response = await fetch(targetUrl, {
        method: method || 'GET',
        headers: {
          ...headers,
          'X-Federation-From': from_node,
          'X-Federation-Proxy': 'true'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const responseBody = await response.json().catch(() => response.text());
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        status_code: response.status,
        headers: Object.fromEntries(response.headers),
        body: responseBody,
        latency_ms: latency,
        routed_through: 'hub'
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        return this.createErrorResponse(504, 'Request timeout', latency, await this.getAlternatives(service));
      }
      
      return this.createErrorResponse(502, error.message, latency, await this.getAlternatives(service));
    }
  }

  // Get direct URL for a service
  getDirectUrl(node, service) {
    if (node.network?.tailscale_ip) {
      return `http://${node.network.tailscale_ip}:${service.port}`;
    }
    if (node.network?.local_ip) {
      return `http://${node.network.local_ip}:${service.port}`;
    }
    return null;
  }

  // Build target URL for proxy
  buildTargetUrl(node, service, path) {
    const baseUrl = this.getDirectUrl(node, service);
    if (!baseUrl) {
      throw new Error('No reachable endpoint for node');
    }
    return `${baseUrl}${path || ''}`;
  }

  // Create error response
  createErrorResponse(statusCode, message, latency, alternatives = []) {
    return {
      success: false,
      status_code: statusCode,
      headers: {},
      body: { error: message },
      latency_ms: latency,
      routed_through: 'hub',
      alternatives
    };
  }

  // Get alternative nodes for a service
  async getAlternatives(serviceName) {
    const discovery = await this.discoverService(serviceName);
    return discovery.available_on
      .filter(instance => instance.status === 'healthy')
      .map(instance => ({
        node_id: instance.node_id,
        status: instance.status
      }));
  }

  // Get service status on specific node
  async getServiceStatus(serviceName, nodeId) {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) return null;
    
    const node = nodeRegistry.nodes.get(nodeId);
    if (!node) return null;
    
    return node.services?.[serviceName] || null;
  }
}

module.exports = FederationServiceRouter;
