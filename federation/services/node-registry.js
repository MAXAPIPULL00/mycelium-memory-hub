// Federation Hub v2 - Node Registry Service
// Task 4: P0 Node Registry Implementation
// Requirements: 2.1-2.8

const { v4: uuidv4 } = require('uuid');

class FederationNodeRegistry {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.isProduction = federationHub.db.isProduction;
    this.nodes = new Map(); // In-memory cache
  }

  async initialize() {
    console.log('📋 Initializing Node Registry...');
    await this.loadNodesFromDatabase();
    console.log(`✅ Node Registry initialized with ${this.nodes.size} nodes`);
  }

  async loadNodesFromDatabase() {
    const query = 'SELECT * FROM federation_nodes';
    
    if (this.isProduction) {
      const result = await this.db.db.query(query);
      result.rows.forEach(row => {
        this.nodes.set(row.id, this.parseNodeRow(row));
      });
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.all(query, [], (err, rows) => {
          if (err) reject(err);
          else {
            (rows || []).forEach(row => {
              this.nodes.set(row.id, this.parseNodeRow(row));
            });
            resolve();
          }
        });
      });
    }
  }

  parseNodeRow(row) {
    return {
      ...row,
      network: typeof row.network === 'string' ? JSON.parse(row.network) : row.network,
      services: typeof row.services === 'string' ? JSON.parse(row.services || '{}') : row.services,
      capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities || '[]') : row.capabilities,
      hardware: typeof row.hardware === 'string' ? JSON.parse(row.hardware || '{}') : row.hardware,
      sovereignty: typeof row.sovereignty === 'string' ? JSON.parse(row.sovereignty || '{}') : row.sovereignty,
      msh_attestation: typeof row.msh_attestation === 'string' ? JSON.parse(row.msh_attestation || 'null') : row.msh_attestation
    };
  }

  // Requirement 2.1, 2.2: Register node with validation
  async registerNode(registration) {
    const { node_id, display_name, owner, network, services, capabilities, hardware, sovereignty, public_key, msh_attestation } = registration;
    
    // Validate node_id uniqueness (Requirement 2.2)
    if (this.nodes.has(node_id)) {
      throw new Error(`Node ID '${node_id}' already exists in the federation`);
    }
    
    const now = new Date().toISOString();
    const node = {
      id: node_id,
      display_name,
      owner,
      network: network || {},
      services: services || {},
      capabilities: capabilities || [],
      hardware: hardware || {},
      sovereignty: sovereignty || {},
      public_key: public_key || null,
      msh_attestation: msh_attestation || null,
      status: 'online',
      last_heartbeat: now,
      registered_at: now,
      updated_at: now
    };
    
    // Store in database
    await this.storeNode(node);
    
    // Update cache
    this.nodes.set(node_id, node);
    
    // Emit event (Requirement 2.7)
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.node.joined',
        source_node: node_id,
        data: { node_id, display_name, owner, capabilities }
      });
    }
    
    return {
      success: true,
      node_id,
      federation_id: 'scri-federation',
      registered_at: now
    };
  }

  async storeNode(node) {
    const query = this.isProduction ?
      `INSERT INTO federation_nodes (id, display_name, owner, network, services, capabilities, hardware, sovereignty, public_key, msh_attestation, status, last_heartbeat, registered_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         display_name = $2, owner = $3, network = $4, services = $5, capabilities = $6,
         hardware = $7, sovereignty = $8, public_key = $9, msh_attestation = $10,
         status = $11, last_heartbeat = $12, updated_at = $14` :
      `INSERT OR REPLACE INTO federation_nodes (id, display_name, owner, network, services, capabilities, hardware, sovereignty, public_key, msh_attestation, status, last_heartbeat, registered_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      node.id,
      node.display_name,
      node.owner,
      JSON.stringify(node.network),
      JSON.stringify(node.services),
      JSON.stringify(node.capabilities),
      JSON.stringify(node.hardware),
      JSON.stringify(node.sovereignty),
      node.public_key,
      JSON.stringify(node.msh_attestation),
      node.status,
      node.last_heartbeat,
      node.registered_at,
      node.updated_at
    ];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    }
  }

  // Requirement 2.3: List all nodes with summary
  async listNodes(filters = {}) {
    const nodes = Array.from(this.nodes.values());
    
    let filtered = nodes;
    
    if (filters.status) {
      filtered = filtered.filter(n => n.status === filters.status);
    }
    
    if (filters.owner) {
      filtered = filtered.filter(n => n.owner === filters.owner);
    }
    
    if (filters.capability) {
      filtered = filtered.filter(n => n.capabilities.includes(filters.capability));
    }
    
    return filtered.map(node => ({
      node_id: node.id,
      display_name: node.display_name,
      owner: node.owner,
      status: node.status,
      last_seen: node.last_heartbeat,
      capabilities_summary: node.capabilities.slice(0, 5),
      hardware_summary: {
        type: node.hardware.type,
        gpu: node.hardware.gpu
      }
    }));
  }

  // Requirement 2.4: Get single node with full details
  async getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    
    return {
      ...node,
      health: await this.hub.healthAggregator?.getNodeHealth(nodeId)
    };
  }

  // Requirement 2.5: Find nodes by capability (online only)
  async findNodesByCapability(capability) {
    const nodes = Array.from(this.nodes.values());
    return nodes.filter(n => 
      n.capabilities.includes(capability) && n.status === 'online'
    ).map(node => ({
      node_id: node.id,
      display_name: node.display_name,
      status: node.status,
      last_seen: node.last_heartbeat
    }));
  }

  // Requirement 2.6, 2.7: Process heartbeat
  async processHeartbeat(nodeId, heartbeat) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node '${nodeId}' not found`);
    }
    
    const previousServices = JSON.stringify(node.services);
    const now = new Date().toISOString();
    
    // Update node state
    node.services = heartbeat.services || node.services;
    node.last_heartbeat = now;
    node.updated_at = now;
    node.status = 'online';
    
    // Store resource metrics in health history
    if (heartbeat.resources && this.hub.healthAggregator) {
      await this.hub.healthAggregator.recordHealth(nodeId, {
        services_status: heartbeat.services,
        resources: heartbeat.resources,
        inference_metrics: heartbeat.inference
      });
    }
    
    // Update database
    await this.updateNodeHeartbeat(nodeId, node);
    
    // Emit service_update event if services changed (Requirement 2.7)
    if (JSON.stringify(heartbeat.services) !== previousServices && this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.service.updated',
        source_node: nodeId,
        data: { node_id: nodeId, services: heartbeat.services }
      });
    }
    
    return { success: true, timestamp: now };
  }

  async updateNodeHeartbeat(nodeId, node) {
    const query = this.isProduction ?
      `UPDATE federation_nodes SET services = $1, last_heartbeat = $2, updated_at = $3, status = $4 WHERE id = $5` :
      `UPDATE federation_nodes SET services = ?, last_heartbeat = ?, updated_at = ?, status = ? WHERE id = ?`;
    
    const params = [
      JSON.stringify(node.services),
      node.last_heartbeat,
      node.updated_at,
      node.status,
      nodeId
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

  // Mark node as offline
  async markNodeOffline(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    node.status = 'offline';
    node.updated_at = new Date().toISOString();
    
    await this.updateNodeStatus(nodeId, 'offline');
    
    // Emit event
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.node.left',
        source_node: nodeId,
        data: { node_id: nodeId, reason: 'heartbeat_timeout' }
      });
    }
  }

  async updateNodeStatus(nodeId, status) {
    const query = this.isProduction ?
      `UPDATE federation_nodes SET status = $1, updated_at = $2 WHERE id = $3` :
      `UPDATE federation_nodes SET status = ?, updated_at = ? WHERE id = ?`;
    
    const params = [status, new Date().toISOString(), nodeId];
    
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

  // Get statistics
  async getStats() {
    const nodes = Array.from(this.nodes.values());
    return {
      total: nodes.length,
      online: nodes.filter(n => n.status === 'online').length,
      offline: nodes.filter(n => n.status === 'offline').length
    };
  }

  // Get online nodes
  getOnlineNodes() {
    return Array.from(this.nodes.values()).filter(n => n.status === 'online');
  }
}

module.exports = FederationNodeRegistry;
