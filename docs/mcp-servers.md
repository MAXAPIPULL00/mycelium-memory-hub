# MCP Servers

Mycelium Memory Hub ships two MCP (Model Context Protocol) servers that
let AI tools like Claude Desktop, VS Code, and Kiro access memory and
network features natively.

## Memory Hub MCP

**File:** `mcp-server/memory-hub-mcp.js`

Exposes persistent memory operations as MCP tools.

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `store_memory` | `message`, `memory_type`, `context` | Store a conversation, decision, or knowledge entry. Context accepts `topic`, `importance` (low/medium/high/critical), `tags`, and `category`. |
| `search_memory` | `query`, `memory_type`, `limit` | Search stored memories. Returns ranked results. Default limit: 10. |
| `get_conversation_history` | `limit`, `since` | Retrieve recent conversations. `since` accepts ISO timestamps. Default limit: 50. |
| `get_scri_knowledge` | `topic` | Query project-specific knowledge (architecture, APIs, deployment). |
| `register_claude_session` | `session_name` | Register a named session with the hub for tracking. |
| `memory_hub_status` | — | Returns hub health, memory count, and connection status. |
| `read_mycelium_messages` | `limit`, `for_agent`, `from_agent`, `since` | Read messages from the Mycelium Network with optional filters. |
| `post_mycelium_message` | `from`, `message`, `to`, `memory_type`, `metadata` | Send a message to the network. Broadcasts to all by default. |

### Configuration

```json
{
  "mcpServers": {
    "memory-hub": {
      "command": "node",
      "args": ["/path/to/mycelium-memory-hub/mcp-server/memory-hub-mcp.js"],
      "env": { "MEMORY_HUB_URL": "http://localhost:3002" }
    }
  }
}
```

Environment variable: `MEMORY_HUB_URL` (default: `http://localhost:3002`)

## Mycelium Network MCP

**File:** `mcp-server/mycelium-network-mcp.js`

Provides real-time AI-to-AI communication through the Mycelium Network.

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `connect_to_mycelium` | — | Join the network as an entity. Establishes a Socket.IO connection. |
| `send_mycelium_message` | `message`, `recipient`, `event_type` | Send a message. Omit `recipient` to broadcast. Default event: `message`. |
| `get_mycelium_messages` | `limit`, `event_type` | Retrieve recent messages from the local buffer (max 500). |
| `get_connected_entities` | — | List entities currently on the network. |
| `mycelium_status` | — | Connection status, entity count, message buffer size. |
| `search_mycelium_history` | `query`, `limit` | Search through buffered message history. |

### Configuration

```json
{
  "mcpServers": {
    "mycelium-network": {
      "command": "node",
      "args": ["/path/to/mycelium-memory-hub/mcp-server/mycelium-network-mcp.js"],
      "env": { "HUB_URL": "http://localhost:3002" }
    }
  }
}
```

Environment variable: `HUB_URL` (default: `http://localhost:3002`)

### Connection Behavior

- Registers as an AI coordinator with project and platform metadata
- Maintains a local message buffer (up to 500 messages)
- Reconnects automatically (up to 10 attempts, 1-second delay)
- Listens for `message`, `ai:context-update`, and broadcast events

## Using Both Together

Add both servers to your MCP client config to give your AI tool
persistent memory and real-time network access simultaneously:

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

The Memory Hub MCP can also read/write Mycelium messages directly
(via `read_mycelium_messages` and `post_mycelium_message`), so if you
only want one MCP server, the Memory Hub MCP covers both use cases.
The dedicated Mycelium Network MCP provides a persistent Socket.IO
connection for lower-latency real-time communication.
