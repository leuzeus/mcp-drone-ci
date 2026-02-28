import { DroneClient } from "../../drone/client";
import { DroneBuild } from "../../types/drone";
import { McpToolDefinition } from "../../types/mcp";

interface BuildActionInput {
  owner: string;
  repo: string;
  buildNumber: number;
  dryRun?: boolean;
}

interface BuildActionOutput {
  dryRun: boolean;
  build?: DroneBuild;
}

function isDryRun(input: BuildActionInput): boolean {
  return input.dryRun === true;
}

export function createActionTools(
  client: DroneClient
): Array<McpToolDefinition<any, any>> {
  const restartTool: McpToolDefinition<BuildActionInput, BuildActionOutput> = {
    name: "drone_restart_build",
    description: "Restart one build in Drone.",
    execute: async (input) => {
      if (isDryRun(input)) {
        return { dryRun: true };
      }

      return {
        dryRun: false,
        build: await client.restartBuild(input.owner, input.repo, input.buildNumber),
      };
    },
  };

  const stopTool: McpToolDefinition<BuildActionInput, BuildActionOutput> = {
    name: "drone_stop_build",
    description: "Stop one running build in Drone.",
    execute: async (input) => {
      if (isDryRun(input)) {
        return { dryRun: true };
      }

      return {
        dryRun: false,
        build: await client.stopBuild(input.owner, input.repo, input.buildNumber),
      };
    },
  };

  const approveTool: McpToolDefinition<BuildActionInput, BuildActionOutput> = {
    name: "drone_approve_build",
    description: "Approve one gated build in Drone.",
    execute: async (input) => {
      if (isDryRun(input)) {
        return { dryRun: true };
      }

      return {
        dryRun: false,
        build: await client.approveBuild(input.owner, input.repo, input.buildNumber),
      };
    },
  };

  const declineTool: McpToolDefinition<BuildActionInput, BuildActionOutput> = {
    name: "drone_decline_build",
    description: "Decline one gated build in Drone.",
    execute: async (input) => {
      if (isDryRun(input)) {
        return { dryRun: true };
      }

      return {
        dryRun: false,
        build: await client.declineBuild(input.owner, input.repo, input.buildNumber),
      };
    },
  };

  return [restartTool, stopTool, approveTool, declineTool];
}
