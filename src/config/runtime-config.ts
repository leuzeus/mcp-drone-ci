import { DroneClientConfig } from "../drone/client";

export interface RuntimeConfig {
  drone: DroneClientConfig;
  webhook: {
    secret: string;
    port: number;
    host: string;
    path: string;
    maxBodySizeBytes: number;
  };
  mcp: {
    readWriteActions: boolean;
    reconcileIntervalMs: number;
    buildStateMaxSnapshots: number;
    buildStateMaxSnapshotsPerRepo: number;
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

function readNonNegativeNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative number.`);
  }

  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new Error(
    `Environment variable ${name} must be a boolean (true/false, 1/0, yes/no).`
  );
}

function readWebhookSecret(port: number): string {
  const provided = process.env.DRONE_WEBHOOK_SECRET?.trim();
  if (port > 0) {
    if (!provided) {
      throw new Error(
        "Missing required environment variable: DRONE_WEBHOOK_SECRET (required when MCP_WEBHOOK_PORT > 0)"
      );
    }
    return provided;
  }

  return provided ?? "";
}

function readDroneBaseUrl(): string {
  const raw = readRequired("DRONE_BASE_URL");
  const allowInsecureHttp = readBoolean("DRONE_ALLOW_INSECURE_HTTP", false);
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Environment variable DRONE_BASE_URL must be a valid absolute URL.");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Environment variable DRONE_BASE_URL must use http or https.");
  }

  if (
    url.protocol === "http:" &&
    !allowInsecureHttp &&
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      "Environment variable DRONE_BASE_URL must use https unless it targets a loopback host or DRONE_ALLOW_INSECURE_HTTP=true is set."
    );
  }

  if (url.username || url.password) {
    throw new Error("Environment variable DRONE_BASE_URL must not embed credentials.");
  }

  if (url.search || url.hash) {
    throw new Error("Environment variable DRONE_BASE_URL must not include query or fragment data.");
  }

  return raw.replace(/\/+$/, "");
}

function readWebhookHost(): string {
  const raw = process.env.MCP_WEBHOOK_HOST?.trim();
  if (!raw) {
    return "127.0.0.1";
  }

  if (
    raw.includes("://") ||
    raw.includes("/") ||
    raw.includes("?") ||
    raw.includes("#") ||
    /\s/.test(raw)
  ) {
    throw new Error("Environment variable MCP_WEBHOOK_HOST must be a plain host or IP value.");
  }

  return raw;
}

function readWebhookPath(): string {
  const raw = process.env.MCP_WEBHOOK_PATH?.trim() || "/webhook/drone";
  if (!raw.startsWith("/")) {
    throw new Error("Environment variable MCP_WEBHOOK_PATH must start with '/'.");
  }

  const parsed = new URL(raw, "http://localhost");
  if (parsed.search || parsed.hash) {
    throw new Error(
      "Environment variable MCP_WEBHOOK_PATH must not include query string or fragment data."
    );
  }

  return parsed.pathname;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const webhookPort = readNonNegativeNumber("MCP_WEBHOOK_PORT", 0);

  return {
    drone: {
      baseUrl: readDroneBaseUrl(),
      token: readRequired("DRONE_TOKEN"),
      timeoutMs: readPositiveNumber("DRONE_TIMEOUT_MS", 10_000),
      maxRetries: readPositiveNumber("DRONE_MAX_RETRIES", 2),
      maxResponseBytes: readPositiveNumber("DRONE_MAX_RESPONSE_BYTES", 2_000_000),
    },
    webhook: {
      secret: readWebhookSecret(webhookPort),
      host: readWebhookHost(),
      port: webhookPort,
      path: readWebhookPath(),
      maxBodySizeBytes: readPositiveNumber("MCP_WEBHOOK_MAX_BODY_BYTES", 1_000_000),
    },
    mcp: {
      readWriteActions: readBoolean("MCP_ENABLE_WRITE_ACTIONS", false),
      reconcileIntervalMs: readNonNegativeNumber("MCP_RECONCILE_INTERVAL_MS", 0),
      buildStateMaxSnapshots: readPositiveNumber("MCP_BUILD_STATE_MAX_SNAPSHOTS", 1_000),
      buildStateMaxSnapshotsPerRepo: readPositiveNumber(
        "MCP_BUILD_STATE_MAX_SNAPSHOTS_PER_REPO",
        200
      ),
    },
  };
}
