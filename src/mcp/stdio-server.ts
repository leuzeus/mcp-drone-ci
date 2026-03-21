import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { DroneClient } from "../drone/client";
import { BuildStateStore } from "../state/build-state-store";
import { DroneMcpServer } from "./server";

interface StartMcpServerOptions {
  readWriteActions: boolean;
  buildStateStore?: BuildStateStore;
}

function toTextResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}

function toErrorResult(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function parseRequiredNumber(value: string | string[] | undefined, name: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid '${name}' value in resource URI.`);
  }

  return parsed;
}

export async function startStdioMcpServer(
  droneClient: DroneClient,
  options: StartMcpServerOptions
): Promise<void> {
  const registry = new DroneMcpServer(droneClient, {
    readWriteActions: options.readWriteActions,
    buildStateStore: options.buildStateStore,
  });

  const toolsByName = new Map(registry.tools.map((tool) => [tool.name, tool]));
  const resourcesByTemplate = new Map(
    registry.resources.map((resource) => [resource.uriTemplate, resource])
  );

  const server = new McpServer({
    name: "mcp-drone-ci",
    version: "1.0.0",
  });

  server.registerTool(
    "drone_list_repos",
    {
      description: "List repositories visible to the Drone token.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async (input, extra) => {
      const tool = toolsByName.get("drone_list_repos");
      if (!tool) {
        return toErrorResult("Tool 'drone_list_repos' is not registered.");
      }

      try {
        const output = await tool.execute(input, {
          requestId: String(extra.requestId),
          caller: "mcp",
        });
        return toTextResult(output);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "drone_list_builds",
    {
      description: "List builds for a repository.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        prNumber: z.number().int().positive().optional(),
        sourceBranch: z.string().min(1).optional(),
        targetBranch: z.string().min(1).optional(),
      },
    },
    async (input, extra) => {
      const tool = toolsByName.get("drone_list_builds");
      if (!tool) {
        return toErrorResult("Tool 'drone_list_builds' is not registered.");
      }

      try {
        const output = await tool.execute(input, {
          requestId: String(extra.requestId),
          caller: "mcp",
        });
        return toTextResult(output);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "drone_get_build",
    {
      description: "Get one build details by build number.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        buildNumber: z.number().int().positive(),
      },
    },
    async (input, extra) => {
      const tool = toolsByName.get("drone_get_build");
      if (!tool) {
        return toErrorResult("Tool 'drone_get_build' is not registered.");
      }

      try {
        const output = await tool.execute(input, {
          requestId: String(extra.requestId),
          caller: "mcp",
        });
        return toTextResult(output);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    "drone_get_build_logs",
    {
      description: "Get logs for one build stage/step.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        buildNumber: z.number().int().positive(),
        stageNumber: z.number().int().positive(),
        stepNumber: z.number().int().positive(),
        limitChars: z.number().int().positive().optional(),
      },
    },
    async (input, extra) => {
      const tool = toolsByName.get("drone_get_build_logs");
      if (!tool) {
        return toErrorResult("Tool 'drone_get_build_logs' is not registered.");
      }

      try {
        const output = await tool.execute(input, {
          requestId: String(extra.requestId),
          caller: "mcp",
        });
        return toTextResult(output);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (options.readWriteActions) {
    server.registerTool(
      "drone_restart_build",
      {
        description: "Restart one build in Drone.",
        inputSchema: {
          owner: z.string().min(1),
          repo: z.string().min(1),
          buildNumber: z.number().int().positive(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) => {
        const tool = toolsByName.get("drone_restart_build");
        if (!tool) {
          return toErrorResult("Tool 'drone_restart_build' is not registered.");
        }

        try {
          const output = await tool.execute(input, {
            requestId: String(extra.requestId),
            caller: "mcp",
          });
          return toTextResult(output);
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );

    server.registerTool(
      "drone_stop_build",
      {
        description: "Stop one running build in Drone.",
        inputSchema: {
          owner: z.string().min(1),
          repo: z.string().min(1),
          buildNumber: z.number().int().positive(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) => {
        const tool = toolsByName.get("drone_stop_build");
        if (!tool) {
          return toErrorResult("Tool 'drone_stop_build' is not registered.");
        }

        try {
          const output = await tool.execute(input, {
            requestId: String(extra.requestId),
            caller: "mcp",
          });
          return toTextResult(output);
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );

    server.registerTool(
      "drone_approve_build",
      {
        description: "Approve one gated build in Drone.",
        inputSchema: {
          owner: z.string().min(1),
          repo: z.string().min(1),
          buildNumber: z.number().int().positive(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) => {
        const tool = toolsByName.get("drone_approve_build");
        if (!tool) {
          return toErrorResult("Tool 'drone_approve_build' is not registered.");
        }

        try {
          const output = await tool.execute(input, {
            requestId: String(extra.requestId),
            caller: "mcp",
          });
          return toTextResult(output);
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );

    server.registerTool(
      "drone_decline_build",
      {
        description: "Decline one gated build in Drone.",
        inputSchema: {
          owner: z.string().min(1),
          repo: z.string().min(1),
          buildNumber: z.number().int().positive(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) => {
        const tool = toolsByName.get("drone_decline_build");
        if (!tool) {
          return toErrorResult("Tool 'drone_decline_build' is not registered.");
        }

        try {
          const output = await tool.execute(input, {
            requestId: String(extra.requestId),
            caller: "mcp",
          });
          return toTextResult(output);
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );
  }

  if (options.buildStateStore) {
    server.registerTool(
      "drone_get_cached_build_state",
      {
        description:
          "Read webhook-cached build state. If buildNumber is omitted, returns recent snapshots for the repository.",
        inputSchema: {
          owner: z.string().min(1),
          repo: z.string().min(1),
          buildNumber: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
        },
      },
      async (input) => {
        try {
          if (input.buildNumber) {
            const snapshot = options.buildStateStore?.get(
              input.owner,
              input.repo,
              input.buildNumber
            );
            return toTextResult({ snapshot: snapshot ?? null });
          }

          const snapshots =
            options.buildStateStore
              ?.listByRepo(input.owner, input.repo)
              .slice(0, input.limit ?? 20) ?? [];
          return toTextResult({ snapshots });
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );
  }

  server.registerResource(
    "drone-latest-build",
    new ResourceTemplate("drone://repo/{owner}/{repo}/latest", { list: undefined }),
    {
      mimeType: "application/json",
      description: "Latest build details for a repository.",
    },
    async (uri, variables) => {
      const resource = resourcesByTemplate.get("drone://repo/{owner}/{repo}/latest");
      if (!resource) {
        throw new Error("Resource template 'latest' is not registered.");
      }

      const data = await resource.read({
        owner: variables.owner,
        repo: variables.repo,
      });

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  server.registerResource(
    "drone-build-summary",
    new ResourceTemplate("drone://repo/{owner}/{repo}/build/{buildNumber}/summary", {
      list: undefined,
    }),
    {
      mimeType: "application/json",
      description: "Build summary by repository and build number.",
    },
    async (uri, variables) => {
      const resource = resourcesByTemplate.get(
        "drone://repo/{owner}/{repo}/build/{buildNumber}/summary"
      );
      if (!resource) {
        throw new Error("Resource template 'build-summary' is not registered.");
      }

      const data = await resource.read({
        owner: variables.owner,
        repo: variables.repo,
        buildNumber: parseRequiredNumber(variables.buildNumber, "buildNumber"),
      });

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  server.registerResource(
    "drone-build-step-logs",
    new ResourceTemplate(
      "drone://repo/{owner}/{repo}/build/{buildNumber}/logs/{stageNumber}/{stepNumber}",
      { list: undefined }
    ),
    {
      mimeType: "application/json",
      description: "One stage/step logs for a build.",
    },
    async (uri, variables) => {
      const resource = resourcesByTemplate.get(
        "drone://repo/{owner}/{repo}/build/{buildNumber}/logs/{stageNumber}/{stepNumber}"
      );
      if (!resource) {
        throw new Error("Resource template 'build-step-logs' is not registered.");
      }

      const data = await resource.read({
        owner: variables.owner,
        repo: variables.repo,
        buildNumber: parseRequiredNumber(variables.buildNumber, "buildNumber"),
        stageNumber: parseRequiredNumber(variables.stageNumber, "stageNumber"),
        stepNumber: parseRequiredNumber(variables.stepNumber, "stepNumber"),
      });

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
