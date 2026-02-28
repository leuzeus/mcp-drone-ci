import { loadRuntimeConfig } from "./config/runtime-config";
import { DroneClient } from "./drone/client";
import { DroneMcpServer } from "./mcp/server";

function bootstrap(): void {
  const runtimeConfig = loadRuntimeConfig();
  const droneClient = new DroneClient(runtimeConfig.drone);
  const server = new DroneMcpServer(droneClient, {
    readWriteActions: runtimeConfig.mcp.readWriteActions,
  });

  console.log(
    `MCP Drone CI scaffold ready with ${server.tools.length} tool(s) and ${server.resources.length} resource(s).`
  );
}

try {
  bootstrap();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to start MCP Drone CI: ${message}`);
  process.exitCode = 1;
}
