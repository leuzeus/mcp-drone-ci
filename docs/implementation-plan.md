# MCP Drone CI Implementation Plan

## 1. Goal
Build an MCP server that exposes Drone CI data and allows an agent (for example, Codex) to:
- track pipeline progress,
- fetch useful logs when a build fails,
- trigger controlled actions (restart, stop, approve) based on explicit rules.

## 2. MVP Scope (read + monitoring)
Included:
- MCP read tools:
  - `drone_list_repos`
  - `drone_list_builds`
  - `drone_get_build`
  - `drone_get_build_logs`
- MCP context resources:
  - `drone://repo/{owner}/{repo}/latest`
  - `drone://repo/{owner}/{repo}/build/{number}/summary`
  - `drone://repo/{owner}/{repo}/build/{number}/logs/{stage}/{step}`
- Drone webhook ingestion (`build:*`) with local state caching.

Out of MVP:
- durable persistence (DB),
- UI dashboard,
- write actions enabled by default (they are prepared but disabled).

## 3. Target Architecture
Main flow:
1. Drone emits webhooks to MCP (`build:created`, `build:updated`, `build:finished`).
2. The webhook component updates `BuildStateStore`.
3. MCP tools/resources read from state cache first, then reconcile with Drone API when needed.
4. The policy engine returns a decision (`wait`, `continue`, `collect_logs_and_stop`).

Components:
- `drone/client`: Drone API wrapper with auth and normalized errors.
- `webhooks/receiver`: event/signature validation and payload parsing.
- `state/build-state-store`: in-memory cache keyed by `owner/repo#build`.
- `mcp/tools`: interaction operations (read/actions).
- `mcp/resources`: contextual snapshots for agents.
- `workflows/reaction-policy`: CI reaction rules.

## 4. Drone API -> MCP Mapping
Read operations:
- Drone `GET /api/user/repos` -> MCP `drone_list_repos`
- Drone `GET /api/repos/{owner}/{repo}/builds` -> MCP `drone_list_builds`
- Drone `GET /api/repos/{owner}/{repo}/builds/{build}` -> MCP `drone_get_build`
- Drone `GET /api/repos/{owner}/{repo}/builds/{build}/logs/{stage}/{step}` -> MCP `drone_get_build_logs`

Actions (phase 2):
- Drone restart build -> MCP `drone_restart_build`
- Drone stop build -> MCP `drone_stop_build`
- Drone approve/decline build -> MCP `drone_approve_build` / `drone_decline_build`

## 5. Prioritized Backlog
## Epic A - Technical Foundations
1. Runtime config (`baseUrl`, token, timeouts, retry, webhook secret).
2. Drone type models (repo/build/log/status).
3. Drone client with typed errors (`401`, `403`, `404`, `429`, `5xx`).
4. Structured logging (`requestId`, `repo`, `buildNumber`).

Definition of done:
- every API call returns an agent-usable error shape,
- timeout/retry are configurable without code changes.

## Epic B - MCP Read Layer (MVP)
1. Tool `drone_list_repos`.
2. Tool `drone_list_builds`.
3. Tool `drone_get_build`.
4. Tool `drone_get_build_logs` with size cap and `truncated` flag.
5. Resources `latest`, `summary`, `logs`.

Definition of done:
- an agent can diagnose a failing build without manual Drone UI checks,
- outputs are stable (versioned schemas).

## Epic C - Webhooks + State Cache
1. HTTP webhook receiver.
2. Signature validation.
3. Relevant event filtering (`build:*`).
4. Upsert into `BuildStateStore`.
5. Periodic reconciliation (low-frequency polling fallback).

Definition of done:
- build state updates in near real time from webhooks,
- if webhooks are missed, fallback restores consistency.

## Epic D - Workflow Reaction Policy
1. Status-to-decision mapping:
  - `pending/running` => `wait`
  - `success` => `continue`
  - `failure/error/killed` => `collect_logs_and_stop`
2. Limited retry rules (for example transient failures).
3. Actionable recommendation output (next step).

Definition of done:
- policy is deterministic and tested for nominal/error cases.

## Epic E - Write Actions (post-MVP)
1. Tools `restart`, `stop`, `approve`, `decline`.
2. Guardrails:
  - `dry_run`,
  - repo allowlist,
  - explicit confirmation required for `stop`.

Definition of done:
- sensitive actions are logged and explicitly authorized.

## Epic F - Quality and Operations
1. Unit tests (client, policy, store).
2. Integration tests (mock Drone API + webhook payloads).
3. MCP contracts (I/O schemas).
4. Ops runbook + troubleshooting.

Definition of done:
- MCP CI pipeline validates critical tests,
- docs are sufficient for handover to another developer.

## 6. Proposed Execution Plan
Week 1:
- Epic A + Epic B (read tools/resources).

Week 2:
- Epic C + Epic D (webhooks/cache/policy).

Week 3:
- Epic E + Epic F (secured actions, tests, hardening).

## 7. Risks and Mitigations
- Large log volume:
  - mitigation: pagination + limit + `truncated` flag.
- Overly broad token permissions:
  - mitigation: read-only token for MVP, separate write token.
- Webhook desynchronization:
  - mitigation: periodic reconciliation + idempotent store updates.
- Policy false positives:
  - mitigation: explicit rules, initial dry-run mode, payload replay tests.

## 8. Global Acceptance Criteria
1. An agent can answer "current CI status" for a repo in a single MCP resource call.
2. On failure, an agent can provide a log-based diagnosis and propose an action.
3. The system supports webhook-first with polling fallback without API overload.
4. Write actions remain disabled until security validation is complete.
