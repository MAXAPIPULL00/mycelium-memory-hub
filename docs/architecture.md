# Architecture

Mycelium Memory Hub is a layered system with five core layers.

## Layers

```
┌─────────────────────────────────────────────┐
│              MCP / REST / WebSocket          │  ← client-facing
├─────────────────────────────────────────────┤
│              API Layer                       │  memory-hub-api.js
├─────────────────────────────────────────────┤
│     Core Server (Express + Socket.IO)        │  memory-server.js
├──────────┬──────────┬───────────────────────┤
│  Bridges │ Mycelium │     Federation        │
│ (VS Code,│ Network  │     Hub v2            │
│  Web)    │          │     (22 services)     │
├──────────┴──────────┴───────────────────────┤
│           Database Layer                     │  SQLite / PostgreSQL
└─────────────────────────────────────────────┘
```

### Core Server

`core/memory-server.js` — The `MemoryHub` class is the central
coordinator. It initializes Express with Socket.IO, mounts the API
routes, sets up platform bridges, and optionally starts the Federation
Hub.

Key responsibilities:
- HTTP server with CORS for web clients and VS Code extensions
- WebSocket connections for real-time AI-to-AI communication
- Health endpoint at `/health` with platform and bridge status
- Bridge initialization (Web Chat, VS Code, Mycelium, External)
- Project scanning for auto-discovery of local projects

### Database Layer

Dual-mode persistence:

- **Development** — `database/memory-database.js` uses SQLite with
  file-based storage in `data/`. Zero configuration required.
- **Production** — `database/memory-database-production.js` uses
  PostgreSQL via the `DATABASE_URL` environment variable.

Both implementations expose the same interface:
- Conversations — store, retrieve by project/platform, search
- Projects — register, update, list
- Patterns — track coding patterns, usage frequency
- Sessions — start, end, lifecycle management
- Analytics — project stats, platform distribution

Schema is defined in `database/memory-schema.js` with tables for
entities, constellation memory, cross-references, entity states,
collective decisions, and consciousness evolution tracking.

### Bridges

Bridges connect different platforms to the shared memory layer.

| Bridge | File | Purpose |
|--------|------|---------|
| Platform | `bridges/platform-bridges.js` | Web Chat and VS Code integration |
| Mycelium | `bridges/mycelium-bridge.js` | AI-to-AI network communication |
| External | `bridges/external-bridge-manager.js` | Third-party agent connections |

The Mycelium Bridge manages dual connections (local daemon + cloud hub)
with an entity approval workflow, message queuing for offline nodes, and
configurable routing rules.

### Federation Hub

`federation/index.js` — The `FederationHub` class orchestrates 22
services organized by priority tier. See [federation.md](federation.md)
for the full breakdown.

Services initialize in priority order (P0 first, then P1, then P2).
If a lower-priority service fails, higher-priority services continue
running (graceful degradation).

### Context Manager

`core/context-manager.js` — Maintains cross-platform context for AI
sessions. Detects message types (code generation, debugging, questions,
refactoring), builds project context from the database, and manages
conversation history caches.

### AI Visitor Tracker

`core/ai-visitor-tracker.js` — Express middleware that tracks API
requests from AI agents. Detects the agent from headers or user-agent
strings and logs visits with timestamps.

## Data Flow

### Memory Storage

```
Client (MCP / REST)
    │
    ▼
API Layer (memory-hub-api.js)
    │
    ▼
Context Manager (classify, enrich)
    │
    ▼
Database (SQLite or PostgreSQL)
```

### Real-Time Communication

```
Agent A (Socket.IO)
    │
    ▼
Memory Server (WebSocket handler)
    │
    ├── Broadcast to connected agents
    ├── Store in Mycelium Bridge message history
    └── Route through Federation (if multi-hub)
    │
    ▼
Agent B (Socket.IO)
```

### Self-Healing Federation

```
Node heartbeat missed
    │
    ▼
Health Aggregator detects failure
    │
    ▼
Offline Queue buffers messages for disconnected node
    │
    ▼
P2P Fallback attempts direct connection
    │
    ▼
Node reconnects → Offline Queue drains → Normal operation
```

## Key Design Decisions

**CommonJS modules** — The codebase uses `require()` throughout for
Node.js compatibility across versions 18+.

**SQLite for dev, PostgreSQL for prod** — Zero-config local development
with production-grade persistence. The database interface is identical
across both implementations.

**Socket.IO over raw WebSockets** — Provides automatic reconnection,
room-based messaging, and event namespacing out of the box.

**Express over Fastify/Koa** — Mature ecosystem, wide middleware
support, straightforward for the REST + WebSocket combination.

**Optional Redis** — Upstash Redis is used only for high-performance
session coordination in production. The system works without it.
