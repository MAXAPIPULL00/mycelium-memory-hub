// Federation Hub v2 - Health Aggregator Service
// Task 6: P0 Health Aggregator Implementation
// Requirements: 3.1-3.7

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

class FederationHealthAggregator {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.isProduction = federationHub.db.isProduction;
    
    // Alert thresholds
    this.thresholds = {
      gpu_utilization_warning: 80,
      gpu_utilization_critical: 95,
      cpu_utilization_warning: 80,
      cpu_utilization_critical: 95,
      ram_utilization_warning: 85,
      ram_utilization_critical: 95,
      disk_utilization_warning: 80,
      disk_utilization_critical: 90
    };
    
    // Alert subscriptions
    this.alertSubscriptions = new Map();
  }

  async initialize() {
    console.log('🏥 Initializing Health Aggregator...');
    console.log('✅ Health Aggregator initialized');
  }

  // Requirement 3.1, 3.2, 3.3: Get federation-wide health
  async getFederationHealth() {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) {
      return { status: 'unknown', nodes: [] };
    }
    
    const nodes = Array.from(nodeRegistry.nodes.values());
    const onlineNodes = nodes.filter(n => n.status === 'online');
    
    // Calculate service totals
    let totalServices = 0;
    let healthyServices = 0;
    
    const nodeHealths = [];
    
    for (const node of nodes) {
      const services = node.services || {};
      const serviceCount = Object.keys(services).length;
      const healthyCount = Object.values(services).filter(s => s.status === 'healthy').length;
      
      totalServices += serviceCount;
      healthyServices += healthyCount;
      
      nodeHealths.push({
        node_id: node.id,
        status: node.status,
        last_heartbeat: node.last_heartbeat,
        uptime_hours: this.calculateUptime(node.registered_at),
        services: {
          total: serviceCount,
          healthy: healthyCount,
          degraded: Object.values(services).filter(s => s.status === 'degraded').length,
          down: Object.values(services).filter(s => s.status === 'down').length
        },
        resources: await this.getLatestResources(node.id)
      });
    }
    
    // Determine federation status
    let federationStatus = 'healthy';
    if (onlineNodes.length === 0) {
      federationStatus = 'critical';
    } else if (onlineNodes.length < nodes.length / 2) {
      federationStatus = 'degraded';
    } else if (healthyServices < totalServices * 0.8) {
      federationStatus = 'degraded';
    }
    
    return {
      federation: {
        status: federationStatus,
        nodes_online: onlineNodes.length,
        nodes_total: nodes.length,
        total_services: totalServices,
        healthy_services: healthyServices
      },
      nodes: nodeHealths,
      alerts: await this.getActiveAlerts(),
      timestamp: new Date().toISOString()
    };
  }

  // Get health for specific node
  async getNodeHealth(nodeId) {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) return null;
    
    const node = nodeRegistry.nodes.get(nodeId);
    if (!node) return null;
    
    const services = node.services || {};
    
    return {
      node_id: node.id,
      status: node.status,
      last_heartbeat: node.last_heartbeat,
      uptime_hours: this.calculateUptime(node.registered_at),
      services: {
        total: Object.keys(services).length,
        healthy: Object.values(services).filter(s => s.status === 'healthy').length,
        degraded: Object.values(services).filter(s => s.status === 'degraded').length,
        down: Object.values(services).filter(s => s.status === 'down').length
      },
      resources: await this.getLatestResources(nodeId),
      inference: await this.getLatestInferenceMetrics(nodeId)
    };
  }

  // Requirement 3.3: Get aggregated service health
  async getServiceHealth(serviceName) {
    const nodeRegistry = this.hub.nodeRegistry;
    if (!nodeRegistry) return null;
    
    const nodes = Array.from(nodeRegistry.nodes.values());
    const serviceInstances = [];
    
    for (const node of nodes) {
      const service = node.services?.[serviceName];
      if (service) {
        serviceInstances.push({
          node_id: node.id,
          status: service.status,
          version: service.version,
          port: service.port
        });
      }
    }
    
    return {
      service: serviceName,
      instances: serviceInstances,
      total: serviceInstances.length,
      healthy: serviceInstances.filter(s => s.status === 'healthy').length,
      degraded: serviceInstances.filter(s => s.status === 'degraded').length,
      down: serviceInstances.filter(s => s.status === 'down').length
    };
  }

  // Requirement 3.4, 3.7: Record health and check thresholds
  async recordHealth(nodeId, healthData) {
    const { services_status, resources, inference_metrics } = healthData;
    
    // Store in health history (Requirement 3.6)
    await this.storeHealthHistory(nodeId, healthData);
    
    // Check thresholds and emit alerts (Requirement 3.4, 3.7)
    if (resources) {
      await this.checkResourceThresholds(nodeId, resources);
    }
  }

  async storeHealthHistory(nodeId, healthData) {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    const query = this.isProduction ?
      `INSERT INTO federation_health_history (id, node_id, timestamp, services_status, resources, inference_metrics)
       VALUES ($1, $2, $3, $4, $5, $6)` :
      `INSERT INTO federation_health_history (id, node_id, timestamp, services_status, resources, inference_metrics)
       VALUES (?, ?, ?, ?, ?, ?)`;
    
    const params = [
      id,
      nodeId,
      timestamp,
      JSON.stringify(healthData.services_status || {}),
      JSON.stringify(healthData.resources || {}),
      JSON.stringify(healthData.inference_metrics || {})
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

  // Check resource thresholds and emit alerts
  async checkResourceThresholds(nodeId, resources) {
    const alerts = [];
    
    // GPU utilization
    if (resources.gpu_utilization_pct >= this.thresholds.gpu_utilization_critical) {
      alerts.push(this.createAlert(nodeId, 'critical', 'gpu_utilization', 
        `GPU utilization at ${resources.gpu_utilization_pct}%`, resources));
    } else if (resources.gpu_utilization_pct >= this.thresholds.gpu_utilization_warning) {
      alerts.push(this.createAlert(nodeId, 'warning', 'gpu_utilization',
        `GPU utilization at ${resources.gpu_utilization_pct}%`, resources));
    }
    
    // CPU utilization
    if (resources.cpu_utilization_pct >= this.thresholds.cpu_utilization_critical) {
      alerts.push(this.createAlert(nodeId, 'critical', 'cpu_utilization',
        `CPU utilization at ${resources.cpu_utilization_pct}%`, resources));
    } else if (resources.cpu_utilization_pct >= this.thresholds.cpu_utilization_warning) {
      alerts.push(this.createAlert(nodeId, 'warning', 'cpu_utilization',
        `CPU utilization at ${resources.cpu_utilization_pct}%`, resources));
    }
    
    // Disk utilization
    if (resources.disk_used_pct >= this.thresholds.disk_utilization_critical) {
      alerts.push(this.createAlert(nodeId, 'critical', 'disk_utilization',
        `Disk utilization at ${resources.disk_used_pct}%`, resources));
    } else if (resources.disk_used_pct >= this.thresholds.disk_utilization_warning) {
      alerts.push(this.createAlert(nodeId, 'warning', 'disk_utilization',
        `Disk utilization at ${resources.disk_used_pct}%`, resources));
    }
    
    // Emit alerts
    for (const alert of alerts) {
      await this.emitAlert(alert);
    }
  }

  createAlert(nodeId, severity, type, message, metrics) {
    return {
      id: uuidv4(),
      severity,
      type,
      node_id: nodeId,
      message,
      timestamp: new Date().toISOString(),
      metrics
    };
  }

  // Requirement 3.5: Subscribe to alerts
  async subscribeToAlerts(subscription) {
    const id = uuidv4();
    this.alertSubscriptions.set(id, subscription);
    return id;
  }

  async unsubscribeFromAlerts(subscriptionId) {
    this.alertSubscriptions.delete(subscriptionId);
  }

  // Emit alert to subscribers
  async emitAlert(alert) {
    // Emit via event bus
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.health.alert',
        source_node: alert.node_id,
        data: alert
      });
    }
    
    // Notify subscribers
    for (const [id, subscription] of this.alertSubscriptions) {
      if (!subscription.alert_types || subscription.alert_types.includes(alert.type)) {
        if (subscription.channel === 'websocket' && subscription.socket) {
          subscription.socket.emit('federation:health-alert', alert);
        }
        if (subscription.channel === 'webhook' && subscription.url) {
          this._deliverWebhook(subscription.url, alert).catch(err => {
            console.warn(`⚠️ Webhook delivery failed for ${subscription.url}: ${err.message}`);
          });
        }
      }
    }
  }

  async _deliverWebhook(url, alert) {
    await axios.post(url, {
      event: 'federation.health.alert',
      alert,
      timestamp: new Date().toISOString(),
    }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get active alerts (last hour)
  async getActiveAlerts() {
    // For now, return empty array - alerts are transient
    // TODO: Implement alert persistence if needed
    return [];
  }

  // Get latest resources for a node
  async getLatestResources(nodeId) {
    const query = this.isProduction ?
      `SELECT resources FROM federation_health_history WHERE node_id = $1 ORDER BY timestamp DESC LIMIT 1` :
      `SELECT resources FROM federation_health_history WHERE node_id = ? ORDER BY timestamp DESC LIMIT 1`;
    
    if (this.isProduction) {
      const result = await this.db.db.query(query, [nodeId]);
      if (result.rows.length > 0) {
        return typeof result.rows[0].resources === 'string' 
          ? JSON.parse(result.rows[0].resources) 
          : result.rows[0].resources;
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.get(query, [nodeId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources);
          } else {
            resolve(null);
          }
        });
      });
    }
    
    return null;
  }

  // Get latest inference metrics for a node
  async getLatestInferenceMetrics(nodeId) {
    const query = this.isProduction ?
      `SELECT inference_metrics FROM federation_health_history WHERE node_id = $1 ORDER BY timestamp DESC LIMIT 1` :
      `SELECT inference_metrics FROM federation_health_history WHERE node_id = ? ORDER BY timestamp DESC LIMIT 1`;
    
    if (this.isProduction) {
      const result = await this.db.db.query(query, [nodeId]);
      if (result.rows.length > 0) {
        return typeof result.rows[0].inference_metrics === 'string'
          ? JSON.parse(result.rows[0].inference_metrics)
          : result.rows[0].inference_metrics;
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.get(query, [nodeId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(typeof row.inference_metrics === 'string' ? JSON.parse(row.inference_metrics) : row.inference_metrics);
          } else {
            resolve(null);
          }
        });
      });
    }
    
    return null;
  }

  // Calculate uptime in hours
  calculateUptime(registeredAt) {
    if (!registeredAt) return 0;
    const registered = new Date(registeredAt);
    const now = new Date();
    return Math.round((now - registered) / (1000 * 60 * 60) * 10) / 10;
  }

  // Requirement 3.6: Get health history for trend analysis
  async getHealthHistory(nodeId, period = '24h') {
    const hours = parseInt(period) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const query = this.isProduction ?
      `SELECT * FROM federation_health_history WHERE node_id = $1 AND timestamp > $2 ORDER BY timestamp ASC` :
      `SELECT * FROM federation_health_history WHERE node_id = ? AND timestamp > ? ORDER BY timestamp ASC`;
    
    if (this.isProduction) {
      const result = await this.db.db.query(query, [nodeId, since]);
      return result.rows.map(row => ({
        ...row,
        services_status: typeof row.services_status === 'string' ? JSON.parse(row.services_status) : row.services_status,
        resources: typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources,
        inference_metrics: typeof row.inference_metrics === 'string' ? JSON.parse(row.inference_metrics) : row.inference_metrics
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.all(query, [nodeId, since], (err, rows) => {
          if (err) reject(err);
          else {
            resolve((rows || []).map(row => ({
              ...row,
              services_status: typeof row.services_status === 'string' ? JSON.parse(row.services_status) : row.services_status,
              resources: typeof row.resources === 'string' ? JSON.parse(row.resources) : row.resources,
              inference_metrics: typeof row.inference_metrics === 'string' ? JSON.parse(row.inference_metrics) : row.inference_metrics
            })));
          }
        });
      });
    }
  }
}

module.exports = FederationHealthAggregator;
