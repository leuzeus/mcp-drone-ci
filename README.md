# mcp-drone-ci
MCP server scaffold for Drone CI.

## Status
This repository currently provides:
- a TypeScript project scaffold,
- a working Drone HTTP client (read + action endpoints),
- a real MCP server entrypoint on `stdio` (SDK-based),
- MCP tool/resource definitions for Drone CI monitoring,
- webhook parsing and HMAC signature verification,
- optional Drone webhook HTTP receiver with in-memory build-state cache,
- basic policy/state modules,
- initial unit tests.

Still pending before production use:
- webhook event processing to store richer build metadata from payloads,
- persistence backend (DB/Redis) for state beyond process memory,
- broader integration tests against mock Drone API/webhook payloads.

## Implementation Plan
See [docs/implementation-plan.md](docs/implementation-plan.md).

## Requirements
- Node.js 20+
- npm 10+

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Configure environment variables:
```bash
cp .env.example .env
```
3. Build:
```bash
npm run build
```
4. Run tests:
```bash
npm test
```
5. Start:
```bash
npm start
```

## Run As MCP (stdio)
`npm start` launches the MCP server on stdio. Configure your MCP client to spawn:

- command: `node`
- args: `dist/index.js`
- env: `DRONE_BASE_URL`, optional tuning vars (and `DRONE_WEBHOOK_SECRET` only if webhook is enabled)

Example MCP config:

```json
{
  "mcpServers": {
    "drone-ci": {
      "command": "node",
      "args": ["G:\\projets\\mcp-drone-ci\\dist\\index.js"],
      "env": {
        "DRONE_BASE_URL": "https://drone.example.com",
        "MCP_ENABLE_WRITE_ACTIONS": "false",
        "MCP_WEBHOOK_PORT": "0",
        "MCP_RECONCILE_INTERVAL_MS": "5000"
      }
    }
  }
}
```

Windows/JetBrains note:
- set `DRONE_TOKEN` as a Windows environment variable (`User` or `Machine` scope),
- do not set `DRONE_TOKEN` to a placeholder like `"${DRONE_TOKEN}"` in MCP `env` if your client does not expand placeholders; otherwise the literal string is sent and Drone authentication fails (`401`).

## Real-time CI Tracking
To enable webhook-driven state cache:

1. Set `MCP_WEBHOOK_PORT` to a non-zero port (for example `8080`).
2. Set `DRONE_WEBHOOK_SECRET` to the shared secret configured in Drone.
3. Configure Drone webhook target to:
   - `http://<host>:<MCP_WEBHOOK_PORT><MCP_WEBHOOK_PATH>`
   - default path is `/webhook/drone`

Optional fallback polling:
- set `MCP_RECONCILE_INTERVAL_MS` (for example `5000`) to periodically refresh active builds from Drone API.

## Environment Variables
Required:
- `DRONE_BASE_URL`: Drone base URL (for example `https://drone.example.com`)
- `DRONE_TOKEN`: Drone API token

Optional:
- `DRONE_TIMEOUT_MS` (default `10000`)
- `DRONE_MAX_RETRIES` (default `2`)
- `MCP_ENABLE_WRITE_ACTIONS` (default `false`)
- `MCP_RECONCILE_INTERVAL_MS` (default `0`, disabled)
- `MCP_WEBHOOK_PORT` (default `0`, disabled)
- `MCP_WEBHOOK_PATH` (default `/webhook/drone`)
- `DRONE_WEBHOOK_SECRET` (required when `MCP_WEBHOOK_PORT > 0`)

## Security Notes
- Do not commit real tokens or webhook secrets.
- Keep `.env` local and use `.env.example` as template only.
- Use a read-only Drone token by default.
- Keep write actions disabled (`MCP_ENABLE_WRITE_ACTIONS=false`) until authorization guardrails are in place.

## Repository Protection
This repository is configured to enforce:
- branch protection on `main` (PR required, stale review dismissal),
- required status check (`test`),
- linear history and no force-push,
- signed commits on protected branch,
- secret scanning and push protection,
- Dependabot security updates.
