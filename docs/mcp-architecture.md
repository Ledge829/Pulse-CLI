# MCP (Model Context Protocol) Architecture for Pulse CLI

> **Status:** Planning / Design Phase  
> **Target:** v0.4 (Post-plugin system)  
> **Last Updated:** 2025-07-29

## Overview

The Model Context Protocol (MCP) is an open standard for connecting AI
assistants to external tools and data sources. Pulse CLI will support
MCP as an optional, modular integration layer.

## Design Goals

1. **Optional** — MCP is a plugin, not a requirement. Pulse works without it.
2. **Extensible** — Multiple transports: stdio, SSE, WebSocket.
3. **Secure** — Tools explicitly approved by user, never auto-executed.
4. **Composable** — MCP tools appear alongside native tools in the agent
   tool registry.
5. **Familiar** — MCP tool format maps 1:1 with Pulse's ToolDef.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Pulse CLI                       │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Chat   │  │ Workflows│  │ Tool Registry  │  │
│  │ Session │  │ (plan,   │  │ (native tools) │  │
│  │         │  │  build…) │  │                │  │
│  └────┬────┘  └────┬─────┘  └───────┬────────┘  │
│       │            │                │           │
│       └────────────┴────────────────┘           │
│                        │                        │
│               ┌────────┴────────┐               │
│               │  MCP Bridge     │               │
│               │  (optional)     │               │
│               └────────┬────────┘               │
│                        │                        │
└────────────────────────┼────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │  stdio  │    │   SSE   │    │   WS    │
    │transport│    │transport│    │transport│
    └────┬────┘    └────┬────┘    └────┬────┘
         │               │               │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │  Local  │    │Remote   │    │ Remote  │
    │  Server │    │Server   │    │ Server  │
    └─────────┘    └─────────┘    └─────────┘
```

## MCP Client Interface

```typescript
interface MCPClient {
  // Connection lifecycle
  connect(transport: MCPTransport): Promise<void>;
  disconnect(): Promise<void>;

  // Tool discovery
  listTools(): Promise<MCPTool[]>;

  // Tool execution
  callTool(name: string, params: object): Promise<MCPResult>;

  // Resources (optional)
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<string>;
}
```

## Transport Abstraction

```typescript
interface MCPTransport {
  // Send a JSON-RPC message
  send(message: JSONRPCMessage): Promise<void>;

  // Receive messages (async iterator)
  onMessage: AsyncIterable<JSONRPCMessage>;

  // Health check
  ping(): Promise<boolean>;

  // Connection lifecycle
  start(): Promise<void>;
  close(): Promise<void>;
}
```

## Integration with Pulse Tool System

MCP tools are bridged into Pulse's ToolRegistry:

```javascript
class MCPToolAdapter {
  constructor(mcpClient, mcpTool) {
    this.name = `mcp_${mcpTool.name}`;
    this.description = mcpTool.description;
    this.parameters = mcpTool.inputSchema?.properties
      ? Object.entries(mcpTool.inputSchema.properties).map(([name, def]) => ({
          name,
          type: def.type || 'string',
          description: def.description || '',
          required: (mcpTool.inputSchema.required || []).includes(name),
        }))
      : [];
  }

  async handler(params, context) {
    const result = await mcpClient.callTool(this.mcpTool.name, params);
    return result;
  }
}
```

## Security Model

1. **User opt-in** — MCP servers are never auto-connected. User must
   explicitly enable each connection.
2. **Tool whitelist** — User can approve/deny specific MCP tools.
3. **Scoped permissions** — Read-only vs. read-write tool classification.
4. **Connection timeouts** — 30s default, configurable.

## Configuration

```ini
# In ~/.pulse/.env or providers.json
PULSE_MCP_ENABLED=true

# MCP server definitions (JSON in providers.json)
PULSE_MCP_SERVERS=[{
  "name": "local-fs",
  "transport": "stdio",
  "command": "npx",
  "args": ["@modelcontextprotocol/server-filesystem", "/path/to/project"]
}]
```

## Planned MCP Servers

| Server | Transport | Description |
|--------|-----------|-------------|
| Filesystem | stdio | Extended file operations |
| GitHub | stdio/SSE | Repository management |
| Database | stdio | Query databases safely |
| Browser | stdio | Web scraping and testing |
| Docker | stdio | Container management |
| Custom | Any | User-provided servers |

## Implementation Roadmap

### v0.4 (MCP Beta)

- [ ] MCP transport layer (stdio, SSE)
- [ ] MCP client connection management
- [ ] Tool bridging into Pulse ToolRegistry
- [ ] Configuration in providers.json
- [ ] Security: approval flow for MCP tools

### v0.5 (MCP Stable)

- [ ] WebSocket transport
- [ ] Resource management
- [ ] Streaming responses
- [ ] MCP server marketplace (pulse plugin search)
- [ ] Connection health monitoring

## References

- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Pulse Tool Registry](/src/agent/tools/registry.js)
