import { defaultRuntimeConfig } from "./config/runtime-config";
import { DroneClient } from "./drone/client";
import { DroneMcpServer } from "./mcp/server";

function bootstrap(): void {
  const droneClient = new DroneClient(defaultRuntimeConfig.drone);
  const server = new DroneMcpServer(droneClient, {
    readWriteActions: false,
  });

  console.log(
    `MCP Drone CI scaffold ready with ${server.tools.length} tool(s) and ${server.resources.length} resource(s).`
  );
}

bootstrap();
