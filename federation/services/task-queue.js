// Federation Hub v2 - Task Queue
// Task 10: P1 Task Queue Implementation
// Requirements: 6.1-6.8

const { v4: uuidv4 } = require('uuid');

class FederationTaskQueue {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    this.isProduction = federationHub.db.isProduction;
    
    // In-memory queues by priority
    this.queues = {
      critical: [],
      high: [],
      normal: [],
      low: []
    };
    
    // Active tasks
    this.activeTasks = new Map();
  }

  // Requirement 6.1, 6.2, 6.3: Submit task
  async submitTask(task, submittedBy) {
    const { task_type, priority, requirements, routing, payload, callback } = task;
    
    const taskId = uuidv4();
    const now = new Date().toISOString();
    
    // Find assigned node based on routing (Requirement 6.2)
    let assignedNode = null;
    if (routing === 'auto' || !routing) {
      assignedNode = await this.findBestNode(requirements);
    } else if (routing !== 'any' && routing !== 'round_robin' && routing !== 'least_loaded') {
      // Specific node requested
      assignedNode = routing;
    }
    
    const taskData = {
      id: taskId,
      task_type,
      priority: priority || 'normal',
      requirements: requirements || {},
      routing: routing || 'auto',
      payload,
      callback: callback || {},
      status: 'queued',
      assigned_node: assignedNode,
      result: null,
      metrics: null,
      error_message: null,
      submitted_by: submittedBy,
      created_at: now,
      started_at: null,
      completed_at: null
    };
    
    // Store in database
    await this.storeTask(taskData);
    
    // Add to priority queue
    this.queues[taskData.priority].push(taskData);
    this.activeTasks.set(taskId, taskData);
    
    // Calculate estimated wait
    const estimatedWait = this.estimateWaitTime(taskData.priority);
    
    // Emit event
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.task.queued',
        data: { task_id: taskId, task_type, priority: taskData.priority, assigned_node: assignedNode }
      });
    }
    
    return {
      task_id: taskId,
      status: 'queued',
      assigned_node: assignedNode,
      estimated_wait_ms: estimatedWait
    };
  }

  async storeTask(task) {
    const query = this.isProduction ?
      `INSERT INTO federation_tasks (id, task_type, priority, requirements, routing, payload, callback, status, assigned_node, result, metrics, error_message, submitted_by, created_at, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)` :
      `INSERT INTO federation_tasks (id, task_type, priority, requirements, routing, payload, callback, status, assigned_node, result, metrics, error_message, submitted_by, created_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      task.id, task.task_type, task.priority, JSON.stringify(task.requirements),
      task.routing, JSON.stringify(task.payload), JSON.stringify(task.callback),
      task.status, task.assigned_node, JSON.stringify(task.result),
      JSON.stringify(task.metrics), task.error_message, task.submitted_by,
      task.created_at, task.started_at, task.completed_at
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

  // Find best node for task requirements
  async findBestNode(requirements) {
    const nodeRegistry = this.hub.nodeRegistry;
    const modelRegistry = this.hub.modelRegistry;
    
    if (!nodeRegistry) return null;
    
    // If model is required, use model registry
    if (requirements?.model && modelRegistry) {
      const recommendation = await modelRegistry.getBestNodeForModel(requirements.model);
      if (recommendation) {
        return recommendation.recommended_node;
      }
    }
    
    // If capabilities required, find matching nodes
    if (requirements?.capabilities) {
      for (const cap of requirements.capabilities) {
        const nodes = await nodeRegistry.findNodesByCapability(cap);
        if (nodes.length > 0) {
          return nodes[0].node_id;
        }
      }
    }
    
    // Default: return first online node
    const onlineNodes = nodeRegistry.getOnlineNodes();
    return onlineNodes.length > 0 ? onlineNodes[0].id : null;
  }

  // Requirement 6.4: Get task status
  async getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      return {
        task_id: task.id,
        status: task.status,
        assigned_node: task.assigned_node,
        progress: task.progress,
        result: task.result,
        metrics: task.metrics
      };
    }
    
    // Check database
    const query = this.isProduction ?
      `SELECT * FROM federation_tasks WHERE id = $1` :
      `SELECT * FROM federation_tasks WHERE id = ?`;
    
    if (this.isProduction) {
      const result = await this.db.db.query(query, [taskId]);
      if (result.rows.length > 0) {
        return this.parseTaskRow(result.rows[0]);
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.db.get(query, [taskId], (err, row) => {
          if (err) reject(err);
          else resolve(row ? this.parseTaskRow(row) : null);
        });
      });
    }
    
    return null;
  }

  parseTaskRow(row) {
    return {
      task_id: row.id,
      status: row.status,
      assigned_node: row.assigned_node,
      result: typeof row.result === 'string' ? JSON.parse(row.result || 'null') : row.result,
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics || 'null') : row.metrics
    };
  }

  // Requirement 6.5: Complete task and deliver callback
  async completeTask(taskId, result, metrics) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    task.status = 'completed';
    task.result = result;
    task.metrics = metrics;
    task.completed_at = new Date().toISOString();
    
    // Update database
    await this.updateTaskStatus(taskId, 'completed', result, metrics);
    
    // Remove from queue
    this.removeFromQueue(taskId);
    
    // Deliver callback
    await this.deliverCallback(task);
    
    // Emit event
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.task.completed',
        data: { task_id: taskId, assigned_node: task.assigned_node }
      });
    }
  }

  // Requirement 6.6: Fail task
  async failTask(taskId, error) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    task.status = 'failed';
    task.error_message = error;
    task.completed_at = new Date().toISOString();
    
    await this.updateTaskStatus(taskId, 'failed', null, null, error);
    this.removeFromQueue(taskId);
    
    // Emit event
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.task.failed',
        data: { task_id: taskId, error }
      });
    }
  }

  async updateTaskStatus(taskId, status, result, metrics, error = null) {
    const query = this.isProduction ?
      `UPDATE federation_tasks SET status = $1, result = $2, metrics = $3, error_message = $4, completed_at = $5 WHERE id = $6` :
      `UPDATE federation_tasks SET status = ?, result = ?, metrics = ?, error_message = ?, completed_at = ? WHERE id = ?`;
    
    const params = [status, JSON.stringify(result), JSON.stringify(metrics), error, new Date().toISOString(), taskId];
    
    if (this.isProduction) {
      await this.db.db.query(query, params);
    } else {
      await new Promise((resolve, reject) => {
        this.db.db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Deliver callback
  async deliverCallback(task) {
    if (!task.callback) return;
    
    const { type, url, node_id } = task.callback;
    
    if (type === 'webhook' && url) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: task.id,
            status: task.status,
            result: task.result,
            metrics: task.metrics
          })
        });
      } catch (error) {
        console.error(`Callback delivery failed: ${error.message}`);
      }
    } else if (type === 'websocket' && node_id) {
      const wsPool = this.hub.webSocketPool;
      if (wsPool) {
        await wsPool.sendToNode(node_id, {
          type: 'task_completed',
          task_id: task.id,
          result: task.result,
          metrics: task.metrics
        });
      }
    }
  }

  // Remove task from queue
  removeFromQueue(taskId) {
    for (const priority of Object.keys(this.queues)) {
      const index = this.queues[priority].findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.queues[priority].splice(index, 1);
        break;
      }
    }
    this.activeTasks.delete(taskId);
  }

  // Requirement 6.7: Priority ordering
  getNextTask() {
    // Process in priority order: critical > high > normal > low
    for (const priority of ['critical', 'high', 'normal', 'low']) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority][0];
      }
    }
    return null;
  }

  // Requirement 6.8: Get queue status
  async listPendingTasks(filters = {}) {
    const allTasks = [];
    for (const priority of Object.keys(this.queues)) {
      allTasks.push(...this.queues[priority].filter(t => t.status === 'queued'));
    }
    
    return {
      queue_depth: allTasks.length,
      estimated_clear_time_ms: this.estimateWaitTime('low'),
      by_priority: {
        critical: this.queues.critical.length,
        high: this.queues.high.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length
      }
    };
  }

  // Estimate wait time based on queue depth
  estimateWaitTime(priority) {
    const avgTaskTime = 5000; // 5 seconds average
    let tasksAhead = 0;
    
    const priorities = ['critical', 'high', 'normal', 'low'];
    const priorityIndex = priorities.indexOf(priority);
    
    for (let i = 0; i <= priorityIndex; i++) {
      tasksAhead += this.queues[priorities[i]].length;
    }
    
    return tasksAhead * avgTaskTime;
  }
}

module.exports = FederationTaskQueue;
