// Federation Hub v2 - Knowledge Sync Service
// Task 13: P2 Knowledge Sync Implementation
// Requirements: 8.1-8.6

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class FederationKnowledgeSync {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // Sovereignty configurations per node
    this.sovereigntyConfigs = new Map();
    
    // Active sync operations
    this.activeSyncs = new Map();
    
    // Knowledge subscriptions
    this.subscriptions = new Map();
  }

  async initialize() {
    // Load sovereignty configs from database
    await this.loadSovereigntyConfigs();
    console.log('📚 Knowledge Sync service initialized');
  }

  async loadSovereigntyConfigs() {
    try {
      const configs = await this.db.all(`
        SELECT * FROM federation_sovereignty_configs
      `);
      
      for (const config of configs || []) {
        this.sovereigntyConfigs.set(config.node_id, {
          node_id: config.node_id,
          share_categories: JSON.parse(config.share_categories || '[]'),
          receive_categories: JSON.parse(config.receive_categories || '[]'),
          share_with_nodes: JSON.parse(config.share_with_nodes || '[]'),
          receive_from_nodes: JSON.parse(config.receive_from_nodes || '[]'),
          updated_at: config.updated_at
        });
      }
    } catch (error) {
      // Table may not exist yet
      console.log('⚠️ Sovereignty configs table not ready');
    }
  }

  // Requirement 8.1: Configure sovereignty settings
  async configureSovereignty(nodeId, config) {
    const sovereigntyConfig = {
      node_id: nodeId,
      share_categories: config.share_categories || [],
      receive_categories: config.receive_categories || [],
      share_with_nodes: config.share_with_nodes || ['*'], // '*' means all
      receive_from_nodes: config.receive_from_nodes || ['*'],
      updated_at: new Date().toISOString()
    };

    this.sovereigntyConfigs.set(nodeId, sovereigntyConfig);

    // Persist to database
    try {
      await this.db.run(`
        INSERT OR REPLACE INTO federation_sovereignty_configs 
        (node_id, share_categories, receive_categories, share_with_nodes, receive_from_nodes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        nodeId,
        JSON.stringify(sovereigntyConfig.share_categories),
        JSON.stringify(sovereigntyConfig.receive_categories),
        JSON.stringify(sovereigntyConfig.share_with_nodes),
        JSON.stringify(sovereigntyConfig.receive_from_nodes),
        sovereigntyConfig.updated_at
      ]);
    } catch (error) {
      console.error('Failed to persist sovereignty config:', error);
    }

    return sovereigntyConfig;
  }

  // Requirement 8.2: Validate permissions before sync
  validateSyncPermission(sourceNode, targetNode, category) {
    const sourceConfig = this.sovereigntyConfigs.get(sourceNode);
    const targetConfig = this.sovereigntyConfigs.get(targetNode);

    // Check if source allows sharing this category
    if (sourceConfig) {
      const canShare = sourceConfig.share_categories.includes(category) || 
                       sourceConfig.share_categories.includes('*');
      const canShareWith = sourceConfig.share_with_nodes.includes(targetNode) || 
                          sourceConfig.share_with_nodes.includes('*');
      
      if (!canShare || !canShareWith) {
        return {
          allowed: false,
          reason: `Source node ${sourceNode} does not allow sharing category '${category}' with ${targetNode}`
        };
      }
    }

    // Check if target allows receiving this category
    if (targetConfig) {
      const canReceive = targetConfig.receive_categories.includes(category) || 
                        targetConfig.receive_categories.includes('*');
      const canReceiveFrom = targetConfig.receive_from_nodes.includes(sourceNode) || 
                            targetConfig.receive_from_nodes.includes('*');
      
      if (!canReceive || !canReceiveFrom) {
        return {
          allowed: false,
          reason: `Target node ${targetNode} does not allow receiving category '${category}' from ${sourceNode}`
        };
      }
    }

    return { allowed: true };
  }

  // Requirement 8.3: Execute sync (route through hub without storage)
  async executeSync(syncRequest) {
    const { source_node, target_node, category, documents } = syncRequest;
    
    // Validate permissions
    const permission = this.validateSyncPermission(source_node, target_node, category);
    if (!permission.allowed) {
      // Requirement 8.6: Reject with explanation
      return {
        success: false,
        error: 'sovereignty_violation',
        reason: permission.reason
      };
    }

    const syncId = uuidv4();
    const syncOperation = {
      sync_id: syncId,
      source_node,
      target_node,
      category,
      total_documents: documents.length,
      synced_documents: 0,
      status: 'in_progress',
      started_at: new Date().toISOString()
    };

    this.activeSyncs.set(syncId, syncOperation);

    // Requirement 8.4: Emit progress events
    await this.emitSyncProgress(syncOperation);

    // Route documents to target (hub doesn't store, just forwards)
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      
      // Forward to target node via WebSocket
      if (this.hub.webSocketPool) {
        await this.hub.webSocketPool.sendToNode(target_node, {
          type: 'knowledge_sync',
          sync_id: syncId,
          category,
          document: doc,
          index: i,
          total: documents.length
        });
      }

      syncOperation.synced_documents = i + 1;
      
      // Emit progress every 10 documents or at completion
      if ((i + 1) % 10 === 0 || i === documents.length - 1) {
        await this.emitSyncProgress(syncOperation);
      }
    }

    syncOperation.status = 'completed';
    syncOperation.completed_at = new Date().toISOString();
    
    await this.emitSyncProgress(syncOperation);
    this.activeSyncs.delete(syncId);

    return {
      success: true,
      sync_id: syncId,
      documents_synced: documents.length
    };
  }

  async emitSyncProgress(syncOperation) {
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'knowledge.sync.progress',
        source_node: syncOperation.source_node,
        data: {
          sync_id: syncOperation.sync_id,
          target_node: syncOperation.target_node,
          category: syncOperation.category,
          progress: syncOperation.synced_documents / syncOperation.total_documents,
          synced: syncOperation.synced_documents,
          total: syncOperation.total_documents,
          status: syncOperation.status
        }
      });
    }
  }

  // Requirement 8.5: Subscribe to category updates
  async subscribe(nodeId, categories, callback) {
    const subscriptionId = uuidv4();
    
    this.subscriptions.set(subscriptionId, {
      subscription_id: subscriptionId,
      node_id: nodeId,
      categories,
      callback,
      created_at: new Date().toISOString()
    });

    return subscriptionId;
  }

  async unsubscribe(subscriptionId) {
    return this.subscriptions.delete(subscriptionId);
  }

  // Notify subscribers of new documents
  async notifySubscribers(category, document, sourceNode) {
    for (const [, subscription] of this.subscriptions) {
      if (subscription.categories.includes(category) || subscription.categories.includes('*')) {
        // Check sovereignty
        const permission = this.validateSyncPermission(sourceNode, subscription.node_id, category);
        if (permission.allowed) {
          if (subscription.callback) {
            subscription.callback({
              category,
              document,
              source_node: sourceNode
            });
          }
          
          // Also send via WebSocket
          if (this.hub.webSocketPool) {
            await this.hub.webSocketPool.sendToNode(subscription.node_id, {
              type: 'knowledge_update',
              category,
              document,
              source_node: sourceNode
            });
          }
        }
      }
    }
  }

  // Get sovereignty config for a node
  getSovereigntyConfig(nodeId) {
    return this.sovereigntyConfigs.get(nodeId) || null;
  }

  // Get active sync operations
  getActiveSyncs() {
    return Array.from(this.activeSyncs.values());
  }

  // Get sync status
  getSyncStatus(syncId) {
    return this.activeSyncs.get(syncId) || null;
  }
}

module.exports = FederationKnowledgeSync;
