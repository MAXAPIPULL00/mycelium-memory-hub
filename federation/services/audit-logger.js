// Federation Hub v2 - Audit Logger Service
// Task 20: Audit Logging Implementation
// Requirements: 14.1-14.7

const { v4: uuidv4 } = require('uuid');

class FederationAuditLogger {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // Default retention: 90 days
    this.retentionDays = 90;
    
    // Cleanup interval
    this.cleanupInterval = null;
  }

  async initialize() {
    // Start retention cleanup job (daily)
    this.startCleanupJob();
    console.log('📋 Audit Logger service initialized');
  }

  // Requirement 14.1: Log authentication attempts
  async logAuthentication(nodeId, outcome, details = {}) {
    return await this.log({
      action: 'authentication',
      node_id: nodeId,
      outcome,
      details: {
        method: details.method || 'token',
        ip_address: details.ip_address,
        user_agent: details.user_agent,
        reason: details.reason
      }
    });
  }

  // Requirement 14.2: Log message sends (metadata only)
  async logMessageSend(fromNode, toNode, messageId, details = {}) {
    return await this.log({
      action: 'message_send',
      node_id: fromNode,
      outcome: 'success',
      details: {
        message_id: messageId,
        to_node: toNode,
        channel: details.channel,
        content_type: details.content_type,
        size_bytes: details.size_bytes
        // Note: actual content is NOT logged
      }
    });
  }

  // Requirement 14.3: Log proxy requests
  async logProxyRequest(nodeId, targetNode, service, outcome, details = {}) {
    return await this.log({
      action: 'proxy_request',
      node_id: nodeId,
      outcome,
      details: {
        target_node: targetNode,
        service,
        method: details.method,
        path: details.path,
        status_code: details.status_code,
        latency_ms: details.latency_ms,
        error: details.error
      }
    });
  }

  // Requirement 14.4: Log secret access
  async logSecretAccess(nodeId, secretId, action, outcome, details = {}) {
    return await this.log({
      action: `secret_${action}`,
      node_id: nodeId,
      outcome,
      details: {
        secret_id: secretId,
        secret_name: details.secret_name,
        reason: details.reason
      }
    });
  }

  // Generic log method
  async log(entry) {
    const logEntry = {
      log_id: uuidv4(),
      action: entry.action,
      node_id: entry.node_id,
      outcome: entry.outcome || 'success',
      details: JSON.stringify(entry.details || {}),
      timestamp: new Date().toISOString()
    };

    try {
      await this.db.run(`
        INSERT INTO federation_audit_log 
        (log_id, action, node_id, outcome, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        logEntry.log_id,
        logEntry.action,
        logEntry.node_id,
        logEntry.outcome,
        logEntry.details,
        logEntry.timestamp
      ]);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }

    return logEntry;
  }

  // Requirement 14.5: Query audit logs with filtering
  async query(filters = {}) {
    const { node_id, action, outcome, start_time, end_time, limit = 100, offset = 0 } = filters;

    let query = `SELECT * FROM federation_audit_log WHERE 1=1`;
    const params = [];

    if (node_id) {
      query += ` AND node_id = ?`;
      params.push(node_id);
    }

    if (action) {
      query += ` AND action = ?`;
      params.push(action);
    }

    if (outcome) {
      query += ` AND outcome = ?`;
      params.push(outcome);
    }

    if (start_time) {
      query += ` AND timestamp >= ?`;
      params.push(start_time);
    }

    if (end_time) {
      query += ` AND timestamp <= ?`;
      params.push(end_time);
    }

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const rows = await this.db.all(query, params);
      return (rows || []).map(row => ({
        log_id: row.log_id,
        action: row.action,
        node_id: row.node_id,
        outcome: row.outcome,
        details: JSON.parse(row.details || '{}'),
        timestamp: row.timestamp
      }));
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }

  // Requirement 14.7: Export audit logs
  async export(filters = {}, format = 'json') {
    const logs = await this.query({ ...filters, limit: 10000 });

    if (format === 'csv') {
      return this.toCSV(logs);
    }

    return JSON.stringify(logs, null, 2);
  }

  toCSV(logs) {
    if (logs.length === 0) return '';

    const headers = ['log_id', 'action', 'node_id', 'outcome', 'details', 'timestamp'];
    const rows = logs.map(log => [
      log.log_id,
      log.action,
      log.node_id,
      log.outcome,
      JSON.stringify(log.details).replace(/"/g, '""'),
      log.timestamp
    ]);

    const csvRows = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ];

    return csvRows.join('\n');
  }

  // Requirement 14.6: Retention cleanup (90 days default)
  startCleanupJob() {
    // Run daily
    this.cleanupInterval = setInterval(async () => {
      await this.purgeOldLogs();
    }, 24 * 60 * 60 * 1000);

    // Run immediately on start
    this.purgeOldLogs();
  }

  async purgeOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    try {
      const result = await this.db.run(`
        DELETE FROM federation_audit_log WHERE timestamp < ?
      `, [cutoffDate.toISOString()]);

      if (result && result.changes > 0) {
        console.log(`🧹 Purged ${result.changes} old audit logs`);
      }
    } catch (error) {
      // Table may not exist yet
    }
  }

  stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Get audit stats
  async getStats() {
    try {
      const total = await this.db.get(`SELECT COUNT(*) as count FROM federation_audit_log`);
      const byAction = await this.db.all(`
        SELECT action, COUNT(*) as count FROM federation_audit_log GROUP BY action
      `);
      const byOutcome = await this.db.all(`
        SELECT outcome, COUNT(*) as count FROM federation_audit_log GROUP BY outcome
      `);

      return {
        total: total?.count || 0,
        by_action: byAction || [],
        by_outcome: byOutcome || []
      };
    } catch (error) {
      return { total: 0, by_action: [], by_outcome: [] };
    }
  }
}

module.exports = FederationAuditLogger;
