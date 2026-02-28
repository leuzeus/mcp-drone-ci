# mcp-drone-ci
MCP server scaffold for Drone CI.

## Status
This repository currently provides:
- a TypeScript project scaffold,
- MCP tool/resource definitions for Drone CI monitoring,
- webhook parsing and HMAC signature verification,
- basic policy/state modules,
- initial unit tests.

The Drone HTTP client methods are still stubs and must be implemented before production use.

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

## Environment Variables
Required:
- `DRONE_BASE_URL`: Drone base URL (for example `https://drone.example.com`)
- `DRONE_TOKEN`: Drone API token
- `DRONE_WEBHOOK_SECRET`: shared secret to verify webhook signatures

Optional:
- `DRONE_TIMEOUT_MS` (default `10000`)
- `DRONE_MAX_RETRIES` (default `2`)
- `MCP_ENABLE_WRITE_ACTIONS` (default `false`)

## Security Notes (for public repo)
- Do not commit real tokens or webhook secrets.
- Keep `.env` local and use `.env.example` as template only.
- Use a read-only Drone token by default.
- Keep write actions disabled (`MCP_ENABLE_WRITE_ACTIONS=false`) until authorization guardrails are in place.

## Repository Protection
This repository is configured to enforce:
- branch protection on `main` (PR required, 1 approval, stale review dismissal),
- required status check (`CI / test`),
- linear history and no force-push,
- signed commits on protected branch,
- secret scanning and push protection,
- Dependabot security updates.

## Publishing
You can keep this repository public safely if you follow the security notes above.
