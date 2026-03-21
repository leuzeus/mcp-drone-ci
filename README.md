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

## MCP Tools
Read tools:
- `drone_list_repos`: list repositories visible to the Drone token
- `drone_list_builds`: list build summaries for a repository
- `drone_get_build`: fetch full details for one build
- `drone_get_build_logs`: fetch one stage/step log stream, with optional truncation
- `drone_get_cached_build_state`: inspect webhook-cached build state

Action tools (only when `MCP_ENABLE_WRITE_ACTIONS=true`):
- `drone_restart_build`
- `drone_stop_build`
- `drone_approve_build`
- `drone_decline_build`

Build filters supported by `drone_list_builds`:
- `owner` and `repo` are always required
- optional `prNumber`
- optional `sourceBranch`
- optional `targetBranch`
- optional `page` and `limit`

Example:

```json
{
  "name": "drone_list_builds",
  "arguments": {
    "owner": "leuzeus",
    "repo": "gowire",
    "prNumber": 510,
    "sourceBranch": "S076-gcmp-v2-planning",
    "targetBranch": "dev",
    "limit": 5
  }
}
```

## Token Efficiency
This MCP is designed so agents can stay efficient if they use the tools in the intended order:

1. Use `drone_list_builds` to search.
2. Use `drone_get_build` only for the specific build you want to inspect in detail.
3. Use `drone_get_build_logs` with `limitChars` when you need failure evidence.

Important behavior:
- `drone_list_builds` returns compact build summaries, not full build payloads
- the full build `message` and other verbose fields are reserved for `drone_get_build`
- MCP JSON responses are serialized compactly to reduce token overhead

Recommended agent patterns:
- prefer `owner/repo + prNumber` for PR-centric queries
- otherwise use `owner/repo + sourceBranch + targetBranch`
- keep `limit` small whenever possible
- avoid `drone_list_repos` unless cross-repository discovery is explicitly needed
- avoid broad `drone_list_builds` calls without filters on large repositories

Recommended order of precision:
1. `owner/repo + buildNumber`
2. `owner/repo + prNumber`
3. `owner/repo + sourceBranch + targetBranch`
4. `owner/repo + targetBranch`

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
