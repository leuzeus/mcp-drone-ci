import { DroneClientConfig } from "../drone/client";

export interface RuntimeConfig {
  drone: DroneClientConfig;
  webhook: {
    secret: string;
    port: number;
    path: string;
  };
  mcp: {
    readWriteActions: boolean;
    reconcileIntervalMs: number;
  };
}

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

export function loadRuntimeConfig(): RuntimeConfig {
  const webhookPort = readNonNegativeNumber("MCP_WEBHOOK_PORT", 0);

  return {
    drone: {
      baseUrl: readRequired("DRONE_BASE_URL"),
      token: readRequired("DRONE_TOKEN"),
      timeoutMs: readPositiveNumber("DRONE_TIMEOUT_MS", 10_000),
      maxRetries: readPositiveNumber("DRONE_MAX_RETRIES", 2),
    },
    webhook: {
      secret: readWebhookSecret(webhookPort),
      port: webhookPort,
      path: process.env.MCP_WEBHOOK_PATH?.trim() || "/webhook/drone",
    },
    mcp: {
      readWriteActions: readBoolean("MCP_ENABLE_WRITE_ACTIONS", false),
      reconcileIntervalMs: readNonNegativeNumber("MCP_RECONCILE_INTERVAL_MS", 0),
    },
  };
}
