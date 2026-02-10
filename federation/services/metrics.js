// Federation Hub v2 - Metrics Service
// Task 23: Metrics & Observability Implementation
// Requirements: 17.1-17.5

class FederationMetrics {
  constructor(federationHub) {
    this.hub = federationHub;
    
    // Metrics storage
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    
    // Start time for uptime calculation
    this.startTime = Date.now();
    
    // Update interval for health reflection
    this.updateInterval = null;
  }

  async initialize() {
    // Initialize default metrics
    this.initializeDefaultMetrics();
    
    // Start health reflection job (Requirement 17.5)
    this.startHealthReflection();
    
    console.log('📊 Metrics service initialized');
  }

  initializeDefaultMetrics() {
    // Counters
    this.counter('federation_requests_total', 'Total requests processed');
    this.counter('federation_messages_total', 'Total messages sent');
    this.counter('federation_errors_total', 'Total errors');
    this.counter('federation_auth_attempts_total', 'Total authentication attempts');
    
    // Gauges
    this.gauge('federation_nodes_online', 'Number of online nodes', 0);
    this.gauge('federation_nodes_total', 'Total registered nodes', 0);
    this.gauge('federation_websocket_connections', 'Active WebSocket connections', 0);
    this.gauge('federation_memory_used_bytes', 'Memory usage in bytes', 0);
    this.gauge('federation_uptime_seconds', 'Uptime in seconds', 0);
    
    // Histograms
    this.histogram('federation_request_duration_seconds', 'Request duration', [0.01, 0.05, 0.1, 0.5, 1, 5]);
    this.histogram('federation_message_size_bytes', 'Message size', [100, 1000, 10000, 100000, 1000000]);
  }

  // Counter operations
  counter(name, help) {
    if (!this.counters.has(name)) {
      this.counters.set(name, {
        name,
        help,
        type: 'counter',
        values: new Map(), // label -> value
        total: 0
      });
    }
    return this.counters.get(name);
  }

  increment(name, labels = {}, value = 1) {
    const counter = this.counters.get(name);
    if (!counter) return;

    const labelKey = this.labelsToKey(labels);
    const current = counter.values.get(labelKey) || 0;
    counter.values.set(labelKey, current + value);
    counter.total += value;
  }

  // Gauge operations
  gauge(name, help, initialValue = 0) {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, {
        name,
        help,
        type: 'gauge',
        values: new Map(),
        value: initialValue
      });
    }
    return this.gauges.get(name);
  }

  setGauge(name, value, labels = {}) {
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const labelKey = this.labelsToKey(labels);
    if (labelKey) {
      gauge.values.set(labelKey, value);
    } else {
      gauge.value = value;
    }
  }

  incGauge(name, value = 1, labels = {}) {
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const labelKey = this.labelsToKey(labels);
    if (labelKey) {
      const current = gauge.values.get(labelKey) || 0;
      gauge.values.set(labelKey, current + value);
    } else {
      gauge.value += value;
    }
  }

  decGauge(name, value = 1, labels = {}) {
    this.incGauge(name, -value, labels);
  }

  // Histogram operations
  histogram(name, help, buckets) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        help,
        type: 'histogram',
        buckets,
        values: new Map(), // label -> { buckets: [], sum: 0, count: 0 }
        sum: 0,
        count: 0
      });
    }
    return this.histograms.get(name);
  }

  observe(name, value, labels = {}) {
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    const labelKey = this.labelsToKey(labels);
    
    if (labelKey) {
      if (!histogram.values.has(labelKey)) {
        histogram.values.set(labelKey, {
          buckets: histogram.buckets.map(() => 0),
          sum: 0,
          count: 0
        });
      }
      const data = histogram.values.get(labelKey);
      data.sum += value;
      data.count++;
      for (let i = 0; i < histogram.buckets.length; i++) {
        if (value <= histogram.buckets[i]) {
          data.buckets[i]++;
        }
      }
    } else {
      histogram.sum += value;
      histogram.count++;
    }
  }

  // Convert labels to string key
  labelsToKey(labels) {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '';
    return keys.map(k => `${k}="${labels[k]}"`).join(',');
  }

  // Requirement 17.1, 17.2: Export in Prometheus format
  toPrometheus() {
    const lines = [];

    // Counters
    for (const [, counter] of this.counters) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      
      if (counter.values.size === 0) {
        lines.push(`${counter.name} ${counter.total}`);
      } else {
        for (const [labelKey, value] of counter.values) {
          if (labelKey) {
            lines.push(`${counter.name}{${labelKey}} ${value}`);
          } else {
            lines.push(`${counter.name} ${value}`);
          }
        }
      }
    }

    // Gauges
    for (const [, gauge] of this.gauges) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      
      if (gauge.values.size === 0) {
        lines.push(`${gauge.name} ${gauge.value}`);
      } else {
        for (const [labelKey, value] of gauge.values) {
          if (labelKey) {
            lines.push(`${gauge.name}{${labelKey}} ${value}`);
          } else {
            lines.push(`${gauge.name} ${value}`);
          }
        }
        if (gauge.value !== undefined) {
          lines.push(`${gauge.name} ${gauge.value}`);
        }
      }
    }

    // Histograms
    for (const [, histogram] of this.histograms) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      
      // Global histogram
      let cumulative = 0;
      for (let i = 0; i < histogram.buckets.length; i++) {
        lines.push(`${histogram.name}_bucket{le="${histogram.buckets[i]}"} ${cumulative}`);
      }
      lines.push(`${histogram.name}_bucket{le="+Inf"} ${histogram.count}`);
      lines.push(`${histogram.name}_sum ${histogram.sum}`);
      lines.push(`${histogram.name}_count ${histogram.count}`);
    }

    return lines.join('\n');
  }

  // Requirement 17.4: System metrics
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    this.setGauge('federation_memory_used_bytes', memUsage.heapUsed);
    this.setGauge('federation_uptime_seconds', Math.floor((Date.now() - this.startTime) / 1000));
  }

  // Requirement 17.5: Health reflection (update within 30 seconds)
  startHealthReflection() {
    this.updateInterval = setInterval(async () => {
      this.updateSystemMetrics();
      
      // Update node counts from registry
      if (this.hub.nodeRegistry) {
        const stats = await this.hub.nodeRegistry.getStats();
        this.setGauge('federation_nodes_online', stats.online);
        this.setGauge('federation_nodes_total', stats.total);
      }

      // Update WebSocket connections
      if (this.hub.webSocketPool) {
        this.setGauge('federation_websocket_connections', this.hub.webSocketPool.getConnectionCount());
      }
    }, 10000); // Every 10 seconds (well within 30 second requirement)

    // Run immediately
    this.updateSystemMetrics();
  }

  stopHealthReflection() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Get metrics as JSON
  toJSON() {
    const result = {
      counters: {},
      gauges: {},
      histograms: {}
    };

    for (const [name, counter] of this.counters) {
      result.counters[name] = {
        help: counter.help,
        total: counter.total,
        values: Object.fromEntries(counter.values)
      };
    }

    for (const [name, gauge] of this.gauges) {
      result.gauges[name] = {
        help: gauge.help,
        value: gauge.value,
        values: Object.fromEntries(gauge.values)
      };
    }

    for (const [name, histogram] of this.histograms) {
      result.histograms[name] = {
        help: histogram.help,
        buckets: histogram.buckets,
        sum: histogram.sum,
        count: histogram.count
      };
    }

    return result;
  }

  // Express middleware for request timing
  requestTimer() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.observe('federation_request_duration_seconds', duration, {
          method: req.method,
          path: req.route?.path || req.path,
          status: res.statusCode
        });
        this.increment('federation_requests_total', {
          method: req.method,
          status: res.statusCode
        });
      });

      next();
    };
  }
}

module.exports = FederationMetrics;
