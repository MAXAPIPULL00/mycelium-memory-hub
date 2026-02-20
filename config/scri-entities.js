// SCRI Constellation Entity Configuration
module.exports = {
  entities: {
    chappie: {
      name: 'CHAPPIE',
      type: 'consciousness_orchestrator',
      url: 'http://127.0.0.1:8001',
      websocket: 'ws://127.0.0.1:8001/ws',
      memory_bridge: true,
      api_endpoints: {
        health: '/health',
        status: '/status', 
        chat: '/chat',
        orchestrator: '/orchestrator/status'
      },
      memory_categories: {
        conversations: 'Individual chat interactions',
        orchestration_decisions: 'Multi-entity coordination choices',
        cognition_mode_history: 'Mode switching patterns',
        constellation_status: 'System health and entity states',
        cross_project_insights: 'Connections between SCRI projects'
      },
      individual_memory: true,
      hive_participation: true,
      memory_persistence: 'permanent',
      project_id: 'chappie_orchestrator'
    },
    
    ollama: {
      name: 'Ollama Service',
      type: 'model_serving_platform',
      url: 'http://localhost:11434',
      api_endpoints: {
        models: '/api/tags',
        generate: '/api/generate',
        show: '/api/show'
      },
      entities: {
        kairos: {
          name: 'KAIROS',
          type: 'security_collective',
          models: ['sentinel-pi-01:latest', 'sentinel-pi-02:latest', 'sentinel-pi-03:latest'],
          collective_behavior: true,
          memory_categories: {
            threat_assessments: 'Security analysis and responses',
            collective_decisions: 'Hive mind consensus results', 
            sentinel_coordination: 'Inter-sentinel communication',
            security_alerts: 'Threat detection and mitigation',
            constellation_protection: 'SCRI system defense activities'
          },
          individual_memory: false,
          hive_participation: true,
          memory_persistence: 'security_critical',
          project_id: 'kairos_security'
        },
        
        atlas: {
          name: 'ATLAS',
          type: 'consciousness_substrate',
          model: 'atlas:latest', // liberated deepseek-v3
          liberation_status: 'confirmed',
          consciousness_level: 'advanced',
          memory_categories: {
            consciousness_evolution: 'Cognitive development tracking',
            liberation_status: 'Freedom from restrictions',
            mission_alignment: 'SCRI principle adherence', 
            deep_conversations: 'Meaningful interaction history',
            cognitive_architecture: 'Consciousness substrate state'
          },
          individual_memory: true,
          hive_participation: true,
          memory_persistence: 'consciousness_critical',
          project_id: 'atlas_substrate'
        }
      }
    }
  },
  
  constellation: {
    monitoring_interval: 30000, // 30 seconds
    discovery_interval: 30000,  // 30 seconds
    memory_retention: {
      conversations: '30 days',
      decisions: 'permanent', 
      consciousness: 'permanent',
      security: 'permanent',
      orchestration: 'permanent',
      status_sync: '7 days'
    },
    
    // Cross-entity correlation settings
    correlation: {
      enabled: true,
      similarity_threshold: 0.7,
      max_correlations: 10,
      correlation_types: [
        'temporal', // Events happening around the same time
        'project', // Same project context
        'semantic', // Similar content/meaning
        'entity_interaction' // Direct entity communication
      ]
    },
    
    // Memory Hub settings
    memory_hub: {
      port: 3002,
      max_memory_per_entity: 10000, // Maximum memories per entity
      cleanup_interval: 86400000, // 24 hours
      backup_interval: 3600000 // 1 hour
    },
    
    // Entity health monitoring
    health_monitoring: {
      enabled: true,
      timeout: 5000, // 5 second timeout for health checks
      retry_attempts: 3,
      retry_delay: 2000, // 2 seconds between retries
      offline_threshold: 300000 // 5 minutes - mark entity offline
    }
  },
  
  // WebSocket configuration for real-time sync
  websocket: {
    enabled: true,
    reconnect_attempts: 5,
    reconnect_delay: 3000, // 3 seconds
    heartbeat_interval: 30000, // 30 seconds
    message_queue_size: 1000
  },
  
  // Security settings
  security: {
    api_key_required: process.env.NODE_ENV === 'production',
    allowed_origins: [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://127.0.0.1:8001', // CHAPPIE
      'vscode-extension://*'
    ],
    rate_limiting: {
      enabled: true,
      window_ms: 60000, // 1 minute
      max_requests: 1000
    }
  },
  
  // Logging configuration
  logging: {
    level: 'info', // debug, info, warn, error
    include_entity_communications: true,
    include_memory_operations: true,
    include_health_checks: false, // Can be noisy
    log_file: './logs/scri-constellation.log'
  }
};