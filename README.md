# Mycelium Memory Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-58%20passing-green.svg)](tests/)

*Your AIs forget everything. This fixes that.*

---

## Why

Every AI conversation starts from zero. Your agent has no memory of
yesterday. Your IDE assistant doesn't know what your other IDE assistant
just built. Your local model can't see what your cloud model decided.

You're the only thread connecting them. You copy-paste context. You
repeat yourself. You are the memory, and you shouldn't have to be.

Mycelium gives your AIs persistent memory and the ability to talk to
each other. Directly. In real time.

## What It Does

**Persistent Memory** — conversations, patterns, decisions, and project
context stored across sessions. SQLite for dev, PostgreSQL for prod.
Your AIs remember what happened yesterday, last week, last month.

**Mycelium Network** — real-time AI-to-AI communication over WebSockets.
Your agents register as entities on the network and exchange messages
directly. No human middleware required.

**Federation Mesh** — distributed node registry with task queues,
governance, and knowledge sync across multiple hubs. Your memory layer
scales from a single machine to a network of them.

**MCP Servers** — plug into Claude Desktop, VS Code, Kiro, or any
MCP-compatible client. Your AI tools get memory and inter-agent
communication without custom integration.

**Platform Bridges** — connect web chat, VS Code, and external agents
to shared memory. Every platform your AIs run on becomes part of the
same nervous system.

```
   ┌──────────┐  ┌───────────┐  ┌──────────┐
   │ Claude   │  │ Local LLM │  │  Kiro    │
   │ Desktop  │  │  Agent    │  │  Agent   │
   └────┬─────┘  └─────┬─────┘  └────┬─────┘
        │              │              │
        │     MCP / WebSocket / REST  │
        │              │              │
   ┌────┴──────────────┴──────────────┴────┐
   │          Mycelium Memory Hub          │
   │                                       │
   │  Memory ─── Mycelium ─── Federation   │
   │  (store)    (network)    (mesh)       │
   └───────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/MAXAPIPULL00/mycelium-memory-hub.git
cd mycelium-memory-hub
cp .env.example .env
npm install
npm start
```

Hub starts on `http://localhost:3002`. Health check at `/health`.

## Testing

```bash
npm test                  # Run all 58 tests
npx jest --coverage       # Run with coverage report
npx jest tests/memory-database.test.js  # Run a specific suite
```

The test suite covers:

| Suite | Tests | What it covers |
|-------|-------|---------------|
| `context-manager.test.js` | 20 | Conversation storage, message type detection, context building, cache management |
| `memory-database.test.js` | 18 | CRUD for conversations/projects/patterns/sessions, analytics, upserts |
| `visitor-tracker.test.js` | 11 | AI agent detection, request logging, visitor history limits |
| `rate-limiter.test.js` | 9 | Default limits, per-node custom limits, usage tracking, warning thresholds |

Coverage reports output to `coverage/`.

## Environment Variables

Copy `.env.example` to `.env` before starting. All variables have
sensible defaults for local development.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` uses SQLite, `production` uses PostgreSQL |
| `PORT` | `3002` | Server port |
| `DATABASE_URL` | *(empty)* | PostgreSQL connection string. Leave empty for SQLite dev mode |
| `UPSTASH_REDIS_REST_URL` | *(empty)* | Upstash Redis URL for real-time session coordination (optional) |
| `UPSTASH_REDIS_REST_TOKEN` | *(empty)* | Upstash Redis auth token (optional) |
| `EXTERNAL_BRIDGE_TOKEN` | `change-me` | Auth token for external bridge connections. **Change this in production** |
| `ALLOWED_FILE_WATCH_PATHS` | *(empty)* | Comma-separated paths the project scanner is allowed to watch |
| `DISABLE_OLLAMA_DISCOVERY` | `false` | Set `true` to skip auto-discovery of local Ollama instances |

## Connect Your AI Tools

Add to your MCP client config (Claude Desktop, Kiro, VS Code):

```json
{
  "mcpServers": {
    "memory-hub": {
      "command": "node",
      "args": ["/path/to/mycelium-memory-hub/mcp-server/memory-hub-mcp.js"],
      "env": { "MEMORY_HUB_URL": "http://localhost:3002" }
    },
    "mycelium-network": {
      "command": "node",
      "args": ["/path/to/mycelium-memory-hub/mcp-server/mycelium-network-mcp.js"],
      "env": { "HUB_URL": "http://localhost:3002" }
    }
  }
}
```

Your AI tools now have persistent memory and can communicate with each
other through the Mycelium Network.

## MCP Tools

### Memory Hub
| Tool | What it does |
|------|-------------|
| `store_memory` | Persist a conversation, decision, or context |
| `search_memory` | Search across all stored memories |
| `get_conversation_history` | Retrieve past conversations |
| `get_knowledge` | Query the knowledge base |
| `register_session` | Register an AI session with the hub |
| `hub_status` | Check hub health and stats |
| `read_mycelium_messages` | Read messages from the network |
| `post_mycelium_message` | Send a message to the network |

### Mycelium Network
| Tool | What it does |
|------|-------------|
| `connect_to_mycelium` | Join the network as an entity |
| `send_mycelium_message` | Send a message to another entity |
| `get_mycelium_messages` | Read incoming messages |
| `get_connected_entities` | See who's on the network |
| `mycelium_status` | Network health and stats |
| `search_mycelium_history` | Search past network traffic |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/conversations` | Store a memory |
| GET | `/api/conversations/project/:id` | Get project memories |
| GET | `/api/conversations/platform/:name` | Get platform memories |
| POST | `/api/memory/search` | Search memories |
| POST | `/api/mycelium/messages` | Send a network message |
| GET | `/api/mycelium/messages` | Read network messages |
| GET | `/api/federation/*` | Federation mesh API |
| GET | `/metrics` | Prometheus metrics |

## WebSocket — Real-Time Communication

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3002');

// Register your agent on the network
socket.emit('register-ai-coordinator', {
  ai_agent: 'my-agent',
  project_id: 'my-project',
  platform: 'custom'
});

// Push context updates
socket.emit('ai:context-update', {
  session_id: 'session-123',
  context_data: { current_task: 'code review' }
});

// Receive updates from other agents
socket.on('ai:context-update', (data) => {
  console.log('Update from:', data.source);
});
```

## Federation Services

The federation mesh consists of 22 services organized by priority tier:

**P0 — Core (3 services)**
| Service | Purpose |
|---------|---------|
| Node Registry | Node registration, discovery, and heartbeat tracking |
| WebSocket Pool | Persistent connections between federation nodes |
| Health Aggregator | Federation-wide health monitoring and status rollup |

**P1 — Extended (4 services)**
| Service | Purpose |
|---------|---------|
| Service Router | Request routing and proxying across nodes |
| Model Registry | Tracks available AI models across the federation |
| Task Queue | Distributed task submission, assignment, and tracking |
| Event Bus | Pub/sub event system for inter-service communication |

**P2 — Advanced (12 services)**
| Service | Purpose |
|---------|---------|
| Knowledge Sync | Sovereignty-aware data synchronization between nodes |
| Identity Auth | Ed25519 key-based identity and token authentication |
| Secrets Vault | Encrypted secret storage with access control |
| Message Persistence | TTL-based durable message storage |
| File Transfer | Binary file transfer between nodes |
| Rate Limiter | Per-node request and bandwidth throttling |
| Audit Logger | Security audit trail for all federation actions |
| Offline Queue | Message queuing for temporarily disconnected nodes |
| Governance | Federation modes (open/approval/invite) and role management |
| Metrics | Prometheus-compatible metrics export |
| Degradation | Graceful feature degradation under load or partial failure |
| P2P Fallback | Direct node-to-node communication when the hub is unreachable |

**Nexus UI Integration (3 services)**
| Service | Purpose |
|---------|---------|
| Entity Registry | Persistent entity registration and metadata |
| Access Control | Block/allow lists and entity permissions |
| Nexus API | REST endpoints for dashboard and management UI |

Services initialize in priority order. If a P2 service fails to start,
the hub continues running with P0 and P1 intact (graceful degradation).

## Deploy

### Local (dev)

SQLite, no external dependencies. Just `npm start`.

### Production (Fly.io)

```bash
fly launch
fly secrets set DATABASE_URL=postgres://...
fly secrets set UPSTASH_REDIS_REST_URL=https://...
fly secrets set UPSTASH_REDIS_REST_TOKEN=...
fly deploy
```

PostgreSQL for persistence, optional Upstash Redis for high-performance
real-time session coordination.

## How It Compares

| Feature | Mycelium | Mem0 | LangChain Memory | MemGPT |
|---------|----------|------|-----------------|--------|
| Persistent memory | Yes | Yes | Yes | Yes |
| Real-time AI-to-AI messaging | Yes | No | No | No |
| Federation / multi-hub | Yes | No | No | No |
| MCP native | Yes | No | No | No |
| Self-hosted | Yes | Cloud + self-hosted | Self-hosted | Self-hosted |
| No vendor lock-in | Yes | Partial | Partial | Yes |
| Multi-agent coordination | WebSocket mesh | API only | Chain-based | Agent loop |
| Works with any LLM | Yes (via MCP/REST) | Yes | LangChain ecosystem | OpenAI-focused |

Mycelium's differentiator is the **Mycelium Network** — real-time
WebSocket-based communication between AI agents — combined with
federation for scaling across machines. Most memory solutions store and
retrieve; Mycelium also lets your agents coordinate live.

## Project Structure

```
mycelium-memory-hub/
├── start.js                 # Entry point
├── core/
│   ├── memory-server.js     # Express + Socket.IO server
│   ├── context-manager.js   # Cross-platform context
│   ├── ai-visitor-tracker.js # Request logging
│   └── project-scanner.js   # Auto-discover projects
├── database/
│   ├── memory-database.js          # SQLite (dev)
│   ├── memory-database-production.js # PostgreSQL (prod)
│   ├── memory-schema.js           # Entity schema
│   └── redis-coordination-layer.js # Upstash Redis
├── api/
│   └── memory-hub-api.js    # REST routes
├── bridges/
│   ├── platform-bridges.js  # Web Chat + VS Code
│   ├── mycelium-bridge.js   # Mycelium Network
│   └── external-bridge-manager.js # External integrations
├── mcp-server/
│   ├── memory-hub-mcp.js    # Memory MCP server
│   └── mycelium-network-mcp.js   # Mycelium MCP server
├── federation/               # Federation mesh (22 services)
├── tests/                    # Jest test suite
├── Dockerfile
├── fly.toml
└── .env.example
```

## Docs

- [Architecture](docs/architecture.md) — layered design, data flow, key decisions
- [MCP Servers](docs/mcp-servers.md) — tool reference for both MCP servers
- [Federation](docs/federation.md) — all 22 services, governance, schema

## Built With AI

This project was built with significant AI assistance (Claude). The
architecture, code, and documentation were developed iteratively through
human-AI collaboration. We think that's worth being upfront about — and
it's a fitting origin story for a tool designed to make AIs work better
together.

## License

MIT — see [LICENSE](LICENSE).
