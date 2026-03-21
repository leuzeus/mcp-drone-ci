import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeConfig } from "../config/runtime-config";

const ENV_KEYS = [
  "DRONE_BASE_URL",
  "DRONE_TOKEN",
  "DRONE_WEBHOOK_SECRET",
  "DRONE_TIMEOUT_MS",
  "DRONE_MAX_RETRIES",
  "MCP_ENABLE_WRITE_ACTIONS",
  "MCP_RECONCILE_INTERVAL_MS",
  "MCP_WEBHOOK_PORT",
  "MCP_WEBHOOK_PATH",
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => void
): void {
  const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
    {};

  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    const next = values[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("loadRuntimeConfig reads required variables with webhook disabled", () => {
  withEnv(
    {
      DRONE_BASE_URL: "https://drone.example.com",
      DRONE_TOKEN: "token",
      DRONE_TIMEOUT_MS: "15000",
      DRONE_MAX_RETRIES: "3",
      MCP_ENABLE_WRITE_ACTIONS: "true",
      MCP_RECONCILE_INTERVAL_MS: "5000",
      MCP_WEBHOOK_PORT: "0",
      MCP_WEBHOOK_PATH: "/webhook/drone",
      DRONE_WEBHOOK_SECRET: undefined,
    },
    () => {
      const config = loadRuntimeConfig();
      assert.equal(config.drone.baseUrl, "https://drone.example.com");
      assert.equal(config.drone.timeoutMs, 15000);
      assert.equal(config.drone.maxRetries, 3);
      assert.equal(config.mcp.readWriteActions, true);
      assert.equal(config.mcp.reconcileIntervalMs, 5000);
      assert.equal(config.webhook.port, 0);
      assert.equal(config.webhook.path, "/webhook/drone");
      assert.equal(config.webhook.secret, "");
    }
  );
});

test("loadRuntimeConfig requires webhook secret when webhook server is enabled", () => {
  withEnv(
    {
      DRONE_BASE_URL: "https://drone.example.com",
      DRONE_TOKEN: "token",
      MCP_WEBHOOK_PORT: "8080",
      DRONE_WEBHOOK_SECRET: undefined,
    },
    () => {
      assert.throws(() => loadRuntimeConfig(), /DRONE_WEBHOOK_SECRET/);
    }
  );
});

test("loadRuntimeConfig fails when required env is missing", () => {
  withEnv(
    {
      DRONE_BASE_URL: undefined,
      DRONE_TOKEN: "token",
      DRONE_WEBHOOK_SECRET: "secret",
    },
    () => {
      assert.throws(() => loadRuntimeConfig(), /DRONE_BASE_URL/);
    }
  );
});
