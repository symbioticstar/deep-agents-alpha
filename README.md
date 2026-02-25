# Deep Agents Alpha

A TypeScript Deep Agents starter with:

- `deepagents` + OpenAI-compatible model configuration
- MCP server integration (`stdio`, `http`, `sse`) via `@langchain/mcp-adapters`
- Skills loading from local directories and optional remote Git repos
- Streaming output to CLI (`stdout`) and HTTP SSE API
- Debug logs when `DEBUG=true`
- Quality toolchain: `oxlint`, `oxfmt`, `husky`, `lint-staged`

## Requirements

- Node.js 20+
- pnpm 10+

## Quick Start

```bash
pnpm install
cp .env.example .env
```

Edit `.env` with your OpenAI-compatible endpoint:

```env
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
OPENAI_MODEL=your-model
DEBUG=false
```

Start API server:

```bash
pnpm dev
```

Run CLI stream:

```bash
pnpm dev:cli -- "帮我分析这个仓库结构"
```

Or pipe input:

```bash
echo "Write a short architecture review" | pnpm dev:cli
```

## SSE API

Endpoint:

- `POST /api/agent/stream`
- Content-Type: `application/json`
- Response: `text/event-stream`

Request body:

```json
{
  "input": "Write a summary of this project",
  "threadId": "optional-thread-id",
  "metadata": {
    "source": "frontend"
  }
}
```

SSE events:

- `token` -> `{ "text": "..." }`
- `tool_start` -> `{ "name": "...", "input": {...}, "id": "..." }`
- `tool_end` -> `{ "name": "...", "output": {...}, "id": "..." }`
- `debug` -> `{ "message": "...", "data": {...} }` (only when `DEBUG=true`)
- `error` -> `{ "message": "...", "code": "..." }`
- `done` -> `{ "finishReason": "stop|error|aborted" }`

Example:

```bash
curl -N -X POST "http://localhost:3000/api/agent/stream" \
  -H "Content-Type: application/json" \
  -d '{"input":"Explain MCP in one paragraph"}'
```

If `API_AUTH_TOKEN` is set, include:

```bash
-H "Authorization: Bearer <token>"
```

## MCP Configuration

Configure MCP servers in `mcp.config.yaml`.

```yaml
servers:
  - name: filesystem
    enabled: true
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]

  - name: remote-mcp
    enabled: true
    transport: http
    url: https://example.com/mcp
    headers:
      Authorization: Bearer ${MCP_TOKEN}
```

Environment overrides:

- `MCP_CONFIG_PATH` (default `./mcp.config.yaml`)
- `MCP_ENABLED_SERVERS` (comma separated allowlist)
- `MCP_DISABLED_SERVERS` (comma separated denylist)

## Skills

Default local skills path:

- `./skills`

Set `SKILLS_DIRS` for additional directories:

```env
SKILLS_DIRS=./skills,./another-skills-dir
```

When `REMOTE_SKILLS_ENABLED=true`, `./skills/remote` is also included.

### Sync remote skill repositories

```env
REMOTE_SKILLS_REPOS=https://github.com/anthropics/skills.git#main=>skills/remote/anthropics-skills
```

Then run:

```bash
pnpm sync:skills
```

Format supports multiple repos separated by `;`.

## Debug Logging

Set:

```env
DEBUG=true
```

This enables:

- Internal debug logs to `stderr`
- `debug` events in SSE stream

## Quality Gates

- `pnpm lint`
- `pnpm lint:fix`
- `pnpm format`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`

Pre-commit hook runs `lint-staged`.

## Scripts

- `pnpm dev`: Start Fastify server in watch mode
- `pnpm dev:cli`: Run CLI streaming agent
- `pnpm build`: Compile TypeScript
- `pnpm start`: Run compiled server
- `pnpm sync:skills`: Sync remote skills repos
