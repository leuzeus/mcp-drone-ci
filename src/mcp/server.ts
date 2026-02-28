import { DroneClient } from "../drone/client";
import { McpResourceDefinition, McpToolDefinition } from "../types/mcp";
import { createCiResources } from "./resources/ci-resources";
import { createActionTools } from "./tools/action-tools";
import { createReadOnlyTools } from "./tools/read-only-tools";

export interface McpServerConfig {
  readWriteActions: boolean;
}

export class DroneMcpServer {
  readonly tools: Array<McpToolDefinition<any, any>>;
  readonly resources: Array<McpResourceDefinition<any, any>>;

  constructor(
    droneClient: DroneClient,
    config: McpServerConfig
  ) {
    this.tools = [
      ...createReadOnlyTools(droneClient),
      ...(config.readWriteActions ? createActionTools(droneClient) : []),
    ];
    this.resources = createCiResources(droneClient);
  }
}
