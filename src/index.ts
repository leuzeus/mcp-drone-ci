import { loadRuntimeConfig } from "./config/runtime-config";
import { DroneClient } from "./drone/client";
import { startStdioMcpServer } from "./mcp/stdio-server";
import { BuildStateStore } from "./state/build-state-store";
import { BuildStateReconciler } from "./state/reconciler";
import { startDroneWebhookHttpServer } from "./webhooks/http-server";
import { WebhookReceiver } from "./webhooks/receiver";

async function bootstrap(): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const droneClient = new DroneClient(runtimeConfig.drone);
  const buildStateStore = new BuildStateStore();
  const reconciler = new BuildStateReconciler(droneClient, buildStateStore, {
    intervalMs: runtimeConfig.mcp.reconcileIntervalMs,
  });

  await startStdioMcpServer(droneClient, {
    readWriteActions: runtimeConfig.mcp.readWriteActions,
    buildStateStore,
  });

  if (runtimeConfig.webhook.port > 0) {
    const receiver = new WebhookReceiver(runtimeConfig.webhook.secret);
    await startDroneWebhookHttpServer({
      config: {
        port: runtimeConfig.webhook.port,
        path: runtimeConfig.webhook.path,
      },
      receiver,
      buildStateStore,
    });

    console.error(
      `Drone webhook receiver listening on http://localhost:${runtimeConfig.webhook.port}${runtimeConfig.webhook.path}`
    );
  }

  if (runtimeConfig.mcp.reconcileIntervalMs > 0) {
    reconciler.start();
    console.error(
      `Build-state reconciliation polling enabled every ${runtimeConfig.mcp.reconcileIntervalMs}ms`
    );
  }

  console.error("MCP Drone CI server is running on stdio.");
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to start MCP Drone CI: ${message}`);
  process.exitCode = 1;
});
