# Federation Hub v2

The federation mesh enables multiple Mycelium Memory Hubs to form a
distributed network. Nodes register, discover each other, sync
knowledge, and route tasks across the mesh.

## Service Architecture

22 services organized by priority tier. Higher-priority services
initialize first and continue running if lower-priority services fail.

### P0 — Core (3 services)

These must be running for the federation to function.

| Service | File | Purpose |
|---------|------|---------|
| Node Registry | `node-registry.js` | Node registration, discovery, and heartbeat tracking. Nodes announce themselves and the registry maintains a live directory. |
| WebSocket Pool | `websocket-pool.js` | Persistent Socket.IO connections between federation nodes. Manages connection lifecycle and reconnection. |
| Health Aggregator | `health-aggregator.js` | Collects health status from all nodes and produces a federation-wide health summary. |

### P1 — Extended (4 services)

Operational services that add routing, task management, and eventing.

| Service | File | Purpose |
|---------|------|---------|
| Service Router | `service-router.js` | Routes requests to the appropriate node. Proxies requests when the target data lives on another hub. |
| Model Registry | `model-registry.js` | Tracks which AI models are available on which nodes. Enables model-aware routing. |
| Task Queue | `task-queue.js` | Distributed task submission with priority (1-10), assignment to nodes, and status tracking (pending/running/completed/failed). |
| Event Bus | `event-bus.js` | Pub/sub event system for inter-service communication within the federation. |

### P2 — Advanced (12 services)

Security, resilience, and operational features.

| Service | File | Purpose |
|---------|------|---------|
| Knowledge Sync | `knowledge-sync.js` | Synchronizes memory data between nodes. Supports full, incremental, and targeted sync scopes. Respects data sovereignty. |
| Identity Auth | `identity-auth.js` | Ed25519 key-based identity verification and token authentication for federation participants. |
| Secrets Vault | `secrets-vault.js` | Encrypted storage for API keys and sensitive configuration with access control. |
| Message Persistence | `message-persistence.js` | Durable message storage with TTL-based expiration. Messages survive node restarts. |
| File Transfer | `file-transfer.js` | Binary file transfer between nodes for sharing artifacts, models, or datasets. |
| Rate Limiter | `rate-limiter.js` | Per-node throttling for requests/minute, bandwidth MB/minute, and WebSocket messages/minute. 80% warning threshold. |
| Audit Logger | `audit-logger.js` | Security audit trail recording all federation actions — registrations, queries, configuration changes. |
| Offline Queue | `offline-queue.js` | Buffers messages for temporarily disconnected nodes. Drains automatically on reconnection. |
| Governance | `governance.js` | Federation access modes: **open** (anyone can join), **approval** (requires admin approval), **invite** (explicit allowlist only). Role management for admin/member/observer. |
| Metrics | `metrics.js` | Prometheus-compatible metrics export. Counters (errors, circuit opens, heal requests), gauges (connected nodes, active tasks), histograms (request latency). |
| Degradation | `degradation.js` | Graceful feature degradation under load or partial failure. Disables non-critical services to protect core functionality. |
| P2P Fallback | `p2p-fallback.js` | Direct node-to-node communication when the central hub is unreachable. Maintains connectivity during hub outages. |

### Nexus UI Integration (3 services)

Dashboard and management API.

| Service | File | Purpose |
|---------|------|---------|
| Entity Registry | `entity-registry.js` | Persistent registration for entities (AIs, services, daemons, bridges, clients) with metadata and capabilities. |
| Access Control | `access-control.js` | Block/allow lists for entity-level permissions. Entities can be blocked with a reason or added to an allowlist. |
| Nexus API | `nexus-ui-api.js` | REST endpoints for the management dashboard — federation status, health, node list, entity management, task queue, audit logs. |

## Initialization

```
FederationHub.initialize()
    │
    ├── Schema.initialize()     ← create database tables
    ├── P0: Core services       ← must succeed
    ├── P1: Extended services   ← should succeed
    ├── P2: Advanced services   ← best effort
    ├── Nexus UI services       ← best effort
    └── Mount API routes
```

If a P2 service throws during initialization, the error is logged and
the federation continues with remaining services. P0 failures are fatal.

## Governance Modes

| Mode | Who can join | Use case |
|------|-------------|----------|
| `open` | Anyone | Public federation, development |
| `approval` | Pending admin approval | Semi-public, vetted participants |
| `invite` | Explicit allowlist only | Private federation, production |

Change modes via the API:
```
POST /api/federation/governance/mode
{ "mode": "approval" }
```

## Database Schema

Federation data is stored in the same database as the memory hub
(SQLite in dev, PostgreSQL in prod). Tables are created by
`federation/database/federation-schema.js`:

- `federation_nodes` — registered nodes with status and heartbeat
- `federation_entities` — AI entities, services, daemons
- `federation_tasks` — distributed task queue
- `federation_audit_log` — security audit trail
- `federation_access_lists` — block/allow lists

## API Documentation

Full API specs are available in OpenAPI and AsyncAPI formats:

- REST API: `federation/docs/openapi.yaml`
- WebSocket events: `federation/docs/asyncapi.yaml`
