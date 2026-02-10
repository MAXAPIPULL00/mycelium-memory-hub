# Federation Hub v2

Central coordinator for the SCRI-IOS mesh network. Transforms the SCRI Memory Hub into a federation hub that manages node registration, health monitoring, task routing, and inter-node communication.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Federation Hub v2                         │
├─────────────────────────────────────────────────────────────┤
│  P0 Core Services                                            │
│  ├── Node Registry      - Node registration & discovery      │
│  ├── WebSocket Pool     - Real-time connections              │
│  └── Health Aggregator  - Federation-wide health             │
├─────────────────────────────────────────────────────────────┤
│  P1 Extended Services                                        │
│  ├── Service Router     - Request routing & proxying         │
│  ├── Model Registry     - AI model tracking                  │
│  ├── Task Queue         - Distributed task management        │
│  └── Event Bus          - Pub/sub event system               │
├─────────────────────────────────────────────────────────────┤
│  P2 Advanced Services                                        │
│  ├── Knowledge Sync     - Sovereignty-aware data sync        │
│  ├── Identity Auth      - Ed25519 identity & tokens          │
│  ├── Secrets Vault      - Encrypted secret storage           │
│  ├── Message Persistence- TTL-based message storage          │
│  ├── File Transfer      - Binary file handling               │
│  ├── Rate Limiter       - Per-node rate limiting             │
│  ├── Audit Logger       - Security audit trail               │
│  ├── Offline Queue      - Message queuing for offline nodes  │
│  ├── Governance         - Federation modes & roles           │
│  ├── Metrics            - Prometheus metrics                 │
│  ├── Degradation        - Graceful feature degradation       │
│  └── P2P Fallback       - Direct node communication          │
├─────────────────────────────────────────────────────────────┤
│  Nexus UI Integration                                        │
│  ├── Entity Registry    - Entity persistence                 │
│  ├── Access Control     - Block/allow lists                  │
│  └── Nexus API          - REST endpoints for UI              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Node Registration

```javascript
// Connect via WebSocket
const socket = io("wss://scri-core-memory.fly.dev");

// Register node
socket.emit("federation:register", {
  node_id: "my-node-001",
  network: {
    ip_address: "192.168.0.100",
    port: 8080,
    public_url: "https://my-node.example.com",
  },
  services: [{ name: "memory-hub", status: "running", port: 8765 }],
  capabilities: ["memory", "inference", "storage"],
});

// Send heartbeats
setInterval(() => {
  socket.emit("federation:heartbeat", {
    node_id: "my-node-001",
    services: [{ name: "memory-hub", status: "running" }],
    resources: { cpu_percent: 45, memory_percent: 60 },
  });
}, 30000);
```

### Nexus UI Integration

Configure proxy routes in Nexus backend:

```javascript
const FEDERATION_PROXIES = {
  "/api/federation": "http://192.168.0.69:8766",
  "/api/mycelium": "http://192.168.0.69:8765",
  "/api/hub": "https://scri-core-memory.fly.dev",
};
```

### REST API

- `GET /api/federation/status` - Federation status
- `GET /api/federation/health` - Bridge health
- `POST /api/federation/send` - Send message
- `GET /api/federation/external-entities` - List entities
- `POST /api/federation/memory/store` - Store memory
- `GET /api/federation/memory/search` - Search memories
- `GET /metrics` - Prometheus metrics

See `docs/openapi.yaml` for full API specification.

### WebSocket Events

- `federation:register` - Register node
- `federation:heartbeat` - Send heartbeat
- `federation:message` - Send/receive messages
- `entity:register` - Register entity (Nexus UI)

See `docs/asyncapi.yaml` for full WebSocket specification.

## Services (22 Total)

| Priority | Service             | Description                     |
| -------- | ------------------- | ------------------------------- |
| P0       | node-registry       | Node registration & discovery   |
| P0       | websocket-pool      | WebSocket connection management |
| P0       | health-aggregator   | Federation health monitoring    |
| P1       | service-router      | Request routing & proxying      |
| P1       | model-registry      | AI model tracking               |
| P1       | task-queue          | Distributed task management     |
| P1       | event-bus           | Pub/sub event system            |
| P2       | knowledge-sync      | Sovereignty-aware data sync     |
| P2       | identity-auth       | Ed25519 identity & tokens       |
| P2       | secrets-vault       | Encrypted secret storage        |
| P2       | message-persistence | TTL-based message storage       |
| P2       | file-transfer       | Binary file handling            |
| P2       | rate-limiter        | Per-node rate limiting          |
| P2       | audit-logger        | Security audit trail            |
| P2       | offline-queue       | Offline message queuing         |
| P2       | governance          | Federation modes & roles        |
| P2       | metrics             | Prometheus metrics              |
| P2       | degradation         | Graceful degradation            |
| P2       | p2p-fallback        | Direct node communication       |
| Nexus    | entity-registry     | Entity persistence              |
| Nexus    | access-control      | Block/allow lists               |
| Nexus    | nexus-api           | REST endpoints for UI           |

## Testing

```bash
npm test -- --testPathPattern="federation-hub"
```

## License

MIT - SCRI Constellation
