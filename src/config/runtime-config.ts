import { DroneClientConfig } from "../drone/client";

export interface RuntimeConfig {
  drone: DroneClientConfig;
  webhook: {
    secret: string;
  };
  mcp: {
    readWriteActions: boolean;
  };
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
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

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    drone: {
      baseUrl: readRequired("DRONE_BASE_URL"),
      token: readRequired("DRONE_TOKEN"),
      timeoutMs: readNumber("DRONE_TIMEOUT_MS", 10_000),
      maxRetries: readNumber("DRONE_MAX_RETRIES", 2),
    },
    webhook: {
      secret: readRequired("DRONE_WEBHOOK_SECRET"),
    },
    mcp: {
      readWriteActions: readBoolean("MCP_ENABLE_WRITE_ACTIONS", false),
    },
  };
}
