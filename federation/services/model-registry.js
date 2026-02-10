// Federation Hub v2 - Model Registry
// Task 9: P1 Model Registry Implementation
// Requirements: 5.1-5.6

const { v4: uuidv4 } = require('uuid');

class FederationModelRegistry {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.isProduction = federationHub.db.isProduction;
    
    // In-memory cache: modelId -> { nodeId -> ModelInstance }
    this.models = new Map();
  }

  // Requirement 5.1: Register models for a node
  async registerModels(nodeId, models) {
    for (const model of models) {
      await this.registerModel(nodeId, model);
    }
  }

  async registerModel(nodeId, model) {
    const { model_id, display_name, type, quantization, size_gb, context_length,
            capabilities, inference_port, avg_tokens_per_sec, max_concurrent } = model;
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const modelData = {
      id,
      model_id,
      node_id: nodeId,
      display_name: display_name || model_id,
      type: type || 'gguf',
      quantization,
      size_gb,
      context_length,
      capabilities: capabilities || [],
      inference_port,
      performance_metrics: { avg_tokens_per_sec, max_concurrent },
      status: 'available',
      queue_depth: 0,
      loaded_at: now
    };

    // Store in database
    await this.storeModel(modelData);
    
    // Update cache
    if (!this.models.has(model_id)) {
      this.models.set(model_id, new Map());
    }
    this.models.get(model_id).set(nodeId, modelData);
    
    // Emit event (Requirement 5.5)
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.model.available',
        source_node: nodeId,
        data: { model_id, node_id: nodeId, capabilities }
      });
    }
    
    return modelData;
  }

  async storeModel(model) {
    const query = this.isProduction ?
      `INSERT INTO federation_models (id, model_id, node_id, display_name, type, quantization, size_gb, context_length, capabilities, inference_port, performance_metrics, status, queue_depth, loaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (model_id, node_id) DO UPDATE SET
         display_name = $4, status = $12, queue_depth = $13, loaded_at = $14` :
      `INSERT OR REPLACE INTO federation_models (id, model_id, node_id, display_name, type, quantization, size_gb, context_length, capabilities, inference_port, performance_metrics, status, queue_depth, loaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      model.id, model.model_id, model.node_id, model.display_name, model.type,
      model.quantization, model.size_gb, model.context_length,
      JSON.stringify(model.capabilities), model.inference_port,
      JSON.stringify(model.performance_metrics), model.status, model.queue_depth, model.loaded_at
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

  // Unregister model (Requirement 5.5)
  async unregisterModel(nodeId, modelId) {
    const modelInstances = this.models.get(modelId);
    if (modelInstances) {
      modelInstances.delete(nodeId);
      if (modelInstances.size === 0) {
        this.models.delete(modelId);
      }
    }
    
    const query = this.isProduction ?
      `DELETE FROM federation_models WHERE model_id = $1 AND node_id = $2` :
      `DELETE FROM federation_models WHERE model_id = ? AND node_id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [modelId, nodeId]);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, [modelId, nodeId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    // Emit event
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.model.unloaded',
        source_node: nodeId,
        data: { model_id: modelId, node_id: nodeId }
      });
    }
  }

  // Requirement 5.2: List all models with availability
  async listModels(filters = {}) {
    const results = [];
    
    for (const [modelId, instances] of this.models) {
      const instanceList = Array.from(instances.values());
      
      // Apply filters
      if (filters.type && !instanceList.some(i => i.type === filters.type)) continue;
      
      const capabilities = [...new Set(instanceList.flatMap(i => i.capabilities))];
      const totalCapacity = instanceList.reduce((sum, i) => sum + (i.performance_metrics?.max_concurrent || 1), 0);
      
      results.push({
        model_id: modelId,
        available_on: instanceList.map(i => ({
          node_id: i.node_id,
          status: i.status,
          queue_depth: i.queue_depth
        })),
        capabilities,
        total_capacity: totalCapacity
      });
    }
    
    return results;
  }

  // Requirement 5.3: Find models by capability
  async findModelsByCapability(capability, minContext = 0) {
    const results = [];
    
    for (const [modelId, instances] of this.models) {
      const instanceList = Array.from(instances.values());
      
      // Check if any instance has the capability and meets context requirement
      const matching = instanceList.filter(i => 
        i.capabilities.includes(capability) && 
        (i.context_length || 0) >= minContext
      );
      
      if (matching.length > 0) {
        results.push({
          model_id: modelId,
          available_on: matching.map(i => ({
            node_id: i.node_id,
            status: i.status,
            queue_depth: i.queue_depth
          })),
          capabilities: [...new Set(matching.flatMap(i => i.capabilities))]
        });
      }
    }
    
    return results;
  }

  // Requirement 5.4: Get best node for model
  async getBestNodeForModel(modelId) {
    const instances = this.models.get(modelId);
    if (!instances || instances.size === 0) {
      return null;
    }
    
    const instanceList = Array.from(instances.values())
      .filter(i => i.status === 'available');
    
    if (instanceList.length === 0) {
      return null;
    }
    
    // Sort by queue depth (lowest first)
    instanceList.sort((a, b) => (a.queue_depth || 0) - (b.queue_depth || 0));
    
    const best = instanceList[0];
    const alternatives = instanceList.slice(1).map(i => ({
      node_id: i.node_id,
      queue_depth: i.queue_depth || 0
    }));
    
    return {
      model_id: modelId,
      recommended_node: best.node_id,
      reason: `Lowest queue depth (${best.queue_depth || 0})`,
      alternatives
    };
  }

  // Update model status and queue depth
  async updateModelStatus(nodeId, modelId, status, queueDepth) {
    const instances = this.models.get(modelId);
    if (instances) {
      const instance = instances.get(nodeId);
      if (instance) {
        instance.status = status;
        instance.queue_depth = queueDepth;
      }
    }
    
    const query = this.isProduction ?
      `UPDATE federation_models SET status = $1, queue_depth = $2 WHERE model_id = $3 AND node_id = $4` :
      `UPDATE federation_models SET status = ?, queue_depth = ? WHERE model_id = ? AND node_id = ?`;
    
    if (this.isProduction) {
      await this.db.db.query(query, [status, queueDepth, modelId, nodeId]);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, [status, queueDepth, modelId, nodeId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Requirement 5.6: Get total federation capacity
  getTotalCapacity() {
    let total = 0;
    for (const instances of this.models.values()) {
      for (const instance of instances.values()) {
        if (instance.status === 'available') {
          total += instance.performance_metrics?.max_concurrent || 1;
        }
      }
    }
    return total;
  }
}

module.exports = FederationModelRegistry;
