// Federation Hub v2 - Graceful Degradation Service
// Task 24: Graceful Degradation Implementation
// Requirements: 18.1-18.5

class FederationDegradation {
  constructor(federationHub) {
    this.hub = federationHub;
    
    // Feature priority (lower = more critical, disabled last)
    this.featurePriority = {
      // Critical features (never disabled) - Requirement 18.4
      'heartbeats': 0,
      'health_monitoring': 0,
      'alerts': 0,
      'high_priority_tasks': 0,
      
      // Important features
      'node_registry': 1,
      'event_bus': 2,
      'message_delivery': 3,
      
      // Standard features
      'task_queue': 4,
      'model_registry': 5,
      'service_router': 6,
      
      // Non-critical features (disabled first)
      'knowledge_sync': 7,
      'file_transfer': 8,
      'audit_logging': 9,
      'metrics': 10
    };
    
    // Current state
    this.disabledFeatures = new Set();
    this.degradationLevel = 0; // 0 = normal, higher = more degraded
    
    // Thresholds
    this.thresholds = {
      cpu_percent: 80,
      memory_percent: 85,
      request_queue_size: 1000,
      error_rate_percent: 10
    };
    
    // Monitoring interval
    this.monitorInterval = null;
  }

  async initialize() {
    this.startMonitoring();
    console.log('🛡️ Degradation service initialized');
  }

  // Requirement 18.1: Monitor hub load
  startMonitoring() {
    this.monitorInterval = setInterval(async () => {
      await this.checkLoad();
    }, 5000); // Check every 5 seconds
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async checkLoad() {
    const metrics = this.getLoadMetrics();
    
    // Determine if we need to degrade
    let shouldDegrade = false;
    let degradeReason = null;

    if (metrics.memory_percent > this.thresholds.memory_percent) {
      shouldDegrade = true;
      degradeReason = 'high_memory';
    } else if (metrics.cpu_percent > this.thresholds.cpu_percent) {
      shouldDegrade = true;
      degradeReason = 'high_cpu';
    } else if (metrics.error_rate_percent > this.thresholds.error_rate_percent) {
      shouldDegrade = true;
      degradeReason = 'high_error_rate';
    }

    if (shouldDegrade && this.degradationLevel < this.getMaxDegradationLevel()) {
      await this.degradeNextFeature(degradeReason);
    } else if (!shouldDegrade && this.degradationLevel > 0) {
      // Requirement 18.3: Restore in reverse priority order
      await this.restoreNextFeature();
    }
  }

  getLoadMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    
    return {
      memory_percent: (memUsage.heapUsed / totalMem) * 100,
      cpu_percent: 0, // Would need proper CPU monitoring
      error_rate_percent: 0 // Would track from metrics service
    };
  }

  // Requirement 18.2: Disable features at thresholds
  async degradeNextFeature(reason) {
    // Find next feature to disable (highest priority number that's not critical)
    const features = Object.entries(this.featurePriority)
      .filter(([name, priority]) => priority > 0 && !this.disabledFeatures.has(name))
      .sort((a, b) => b[1] - a[1]); // Sort by priority descending (disable highest first)

    if (features.length === 0) return;

    const [featureName] = features[0];
    this.disabledFeatures.add(featureName);
    this.degradationLevel++;

    // Requirement 18.5: Emit degradation event
    await this.emitDegradationEvent(featureName, 'disabled', reason);

    console.log(`⚠️ Degradation: Disabled ${featureName} (reason: ${reason})`);
  }

  // Requirement 18.3: Restore features in reverse priority order
  async restoreNextFeature() {
    // Find next feature to restore (lowest priority number among disabled)
    const disabledList = Array.from(this.disabledFeatures)
      .map(name => [name, this.featurePriority[name]])
      .sort((a, b) => a[1] - b[1]); // Sort by priority ascending (restore lowest first)

    if (disabledList.length === 0) return;

    const [featureName] = disabledList[0];
    this.disabledFeatures.delete(featureName);
    this.degradationLevel--;

    await this.emitDegradationEvent(featureName, 'restored', 'load_reduced');

    console.log(`✅ Restoration: Enabled ${featureName}`);
  }

  // Requirement 18.5: Emit degradation events
  async emitDegradationEvent(feature, action, reason) {
    if (this.hub.eventBus) {
      await this.hub.eventBus.emit({
        event_type: 'federation.degraded',
        data: {
          feature,
          action,
          reason,
          degradation_level: this.degradationLevel,
          disabled_features: Array.from(this.disabledFeatures),
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Check if a feature is enabled
  isFeatureEnabled(featureName) {
    // Requirement 18.4: Critical features always enabled
    if (this.featurePriority[featureName] === 0) {
      return true;
    }
    return !this.disabledFeatures.has(featureName);
  }

  // Get max degradation level (non-critical features count)
  getMaxDegradationLevel() {
    return Object.values(this.featurePriority).filter(p => p > 0).length;
  }

  // Get current status
  getStatus() {
    return {
      degradation_level: this.degradationLevel,
      max_level: this.getMaxDegradationLevel(),
      disabled_features: Array.from(this.disabledFeatures),
      enabled_features: Object.keys(this.featurePriority)
        .filter(f => !this.disabledFeatures.has(f)),
      critical_features: Object.entries(this.featurePriority)
        .filter(([, p]) => p === 0)
        .map(([name]) => name),
      thresholds: this.thresholds,
      current_load: this.getLoadMetrics()
    };
  }

  // Manually disable a feature
  async disableFeature(featureName, reason = 'manual') {
    if (this.featurePriority[featureName] === 0) {
      return { success: false, error: 'Cannot disable critical feature' };
    }

    if (this.disabledFeatures.has(featureName)) {
      return { success: false, error: 'Feature already disabled' };
    }

    this.disabledFeatures.add(featureName);
    this.degradationLevel++;
    await this.emitDegradationEvent(featureName, 'disabled', reason);

    return { success: true, feature: featureName };
  }

  // Manually enable a feature
  async enableFeature(featureName) {
    if (!this.disabledFeatures.has(featureName)) {
      return { success: false, error: 'Feature not disabled' };
    }

    this.disabledFeatures.delete(featureName);
    this.degradationLevel--;
    await this.emitDegradationEvent(featureName, 'restored', 'manual');

    return { success: true, feature: featureName };
  }

  // Update thresholds
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  // Express middleware to check feature availability
  requireFeature(featureName) {
    return (req, res, next) => {
      if (!this.isFeatureEnabled(featureName)) {
        return res.status(503).json({
          error: 'service_degraded',
          message: `Feature '${featureName}' is temporarily disabled`,
          retry_after: 60
        });
      }
      next();
    };
  }
}

module.exports = FederationDegradation;
