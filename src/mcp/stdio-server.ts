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

const MAX_LIST_LIMIT = 100;
const MAX_LOG_CHAR_LIMIT = 100_000;

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

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid '${name}' value in resource URI.`);
  }

  return parsed;
}

function parseRequiredString(value: string, name: string): string {
  const parsed = value.trim();

  if (!parsed) {
    throw new Error(`'${name}' is required.`);
  }

  return parsed;
}

function parseOptionalString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = value.trim();
  if (!parsed) {
    throw new Error(`'${name}' must not be empty when provided.`);
  }

  return parsed;
}

function parsePositiveInteger(
  value: number | undefined,
  name: string,
  options: { required?: boolean; max?: number } = {}
): number | undefined {
  if (value === undefined) {
    if (options.required) {
      throw new Error(`'${name}' is required.`);
    }
    return undefined;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`'${name}' must be a positive integer.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new Error(`'${name}' must be less than or equal to ${options.max}.`);
  }

  return value;
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

  async function executeTool(name: string, input: unknown, requestId: string) {
    const tool = toolsByName.get(name);
    if (!tool) {
      return toErrorResult(`Tool '${name}' is not registered.`);
    }

    try {
      const output = await tool.execute(input, {
        requestId,
        caller: "mcp",
      });
      return toTextResult(output);
    } catch (error) {
      return toErrorResult(error);
    }
  }

  const server = new McpServer({
    name: "mcp-drone-ci",
    version: "1.0.0",
  });

  server.registerTool(
    "drone_ping",
    {
      description: "Minimal diagnostic tool for MCP client compatibility checks.",
    },
    async () => toTextResult({ ok: true, server: "mcp-drone-ci" })
  );

  server.registerTool(
    "drone_list_repos",
    {
      description: "List repositories visible to the Drone token.",
      inputSchema: {
        page: z.number().optional(),
        limit: z.number().optional(),
      },
    },
    async (input, extra) =>
      executeTool(
        "drone_list_repos",
        {
          page: parsePositiveInteger(input.page, "page"),
          limit: parsePositiveInteger(input.limit, "limit", { max: MAX_LIST_LIMIT }),
        },
        String(extra.requestId)
      )
  );

  server.registerTool(
    "drone_list_builds",
    {
      description: "List builds for a repository.",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        page: z.number().optional(),
        limit: z.number().optional(),
        prNumber: z.number().optional(),
        sourceBranch: z.string().optional(),
        targetBranch: z.string().optional(),
      },
    },
    async (input, extra) =>
      executeTool(
        "drone_list_builds",
        {
          owner: parseRequiredString(input.owner, "owner"),
          repo: parseRequiredString(input.repo, "repo"),
          page: parsePositiveInteger(input.page, "page"),
          limit: parsePositiveInteger(input.limit, "limit", { max: MAX_LIST_LIMIT }),
          prNumber: parsePositiveInteger(input.prNumber, "prNumber"),
          sourceBranch: parseOptionalString(input.sourceBranch, "sourceBranch"),
          targetBranch: parseOptionalString(input.targetBranch, "targetBranch"),
        },
        String(extra.requestId)
      )
  );

  server.registerTool(
    "drone_get_build",
    {
      description: "Get one build details by build number.",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        buildNumber: z.number(),
      },
    },
    async (input, extra) =>
      executeTool(
        "drone_get_build",
        {
          owner: parseRequiredString(input.owner, "owner"),
          repo: parseRequiredString(input.repo, "repo"),
          buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
            required: true,
          }),
        },
        String(extra.requestId)
      )
  );

  server.registerTool(
    "drone_get_build_logs",
    {
      description: "Get logs for one build stage/step.",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        buildNumber: z.number(),
        stageNumber: z.number(),
        stepNumber: z.number(),
        limitChars: z.number().optional(),
      },
    },
    async (input, extra) =>
      executeTool(
        "drone_get_build_logs",
        {
          owner: parseRequiredString(input.owner, "owner"),
          repo: parseRequiredString(input.repo, "repo"),
          buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
            required: true,
          }),
          stageNumber: parsePositiveInteger(input.stageNumber, "stageNumber", {
            required: true,
          }),
          stepNumber: parsePositiveInteger(input.stepNumber, "stepNumber", {
            required: true,
          }),
          limitChars: parsePositiveInteger(input.limitChars, "limitChars", {
            max: MAX_LOG_CHAR_LIMIT,
          }),
        },
        String(extra.requestId)
      )
  );

  if (options.readWriteActions) {
    server.registerTool(
      "drone_restart_build",
      {
        description: "Restart one build in Drone.",
        inputSchema: {
          owner: z.string(),
          repo: z.string(),
          buildNumber: z.number(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) =>
        executeTool(
          "drone_restart_build",
          {
            owner: parseRequiredString(input.owner, "owner"),
            repo: parseRequiredString(input.repo, "repo"),
            buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
              required: true,
            }),
            dryRun: input.dryRun,
          },
          String(extra.requestId)
        )
    );

    server.registerTool(
      "drone_stop_build",
      {
        description: "Stop one running build in Drone.",
        inputSchema: {
          owner: z.string(),
          repo: z.string(),
          buildNumber: z.number(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) =>
        executeTool(
          "drone_stop_build",
          {
            owner: parseRequiredString(input.owner, "owner"),
            repo: parseRequiredString(input.repo, "repo"),
            buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
              required: true,
            }),
            dryRun: input.dryRun,
          },
          String(extra.requestId)
        )
    );

    server.registerTool(
      "drone_approve_build",
      {
        description: "Approve one gated build in Drone.",
        inputSchema: {
          owner: z.string(),
          repo: z.string(),
          buildNumber: z.number(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) =>
        executeTool(
          "drone_approve_build",
          {
            owner: parseRequiredString(input.owner, "owner"),
            repo: parseRequiredString(input.repo, "repo"),
            buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
              required: true,
            }),
            dryRun: input.dryRun,
          },
          String(extra.requestId)
        )
    );

    server.registerTool(
      "drone_decline_build",
      {
        description: "Decline one gated build in Drone.",
        inputSchema: {
          owner: z.string(),
          repo: z.string(),
          buildNumber: z.number(),
          dryRun: z.boolean().optional(),
        },
      },
      async (input, extra) =>
        executeTool(
          "drone_decline_build",
          {
            owner: parseRequiredString(input.owner, "owner"),
            repo: parseRequiredString(input.repo, "repo"),
            buildNumber: parsePositiveInteger(input.buildNumber, "buildNumber", {
              required: true,
            }),
            dryRun: input.dryRun,
          },
          String(extra.requestId)
        )
    );
  }

  if (options.buildStateStore) {
    server.registerTool(
      "drone_get_cached_build_state",
      {
        description:
          "Read webhook-cached build state. If buildNumber is omitted, returns recent snapshots for the repository.",
        inputSchema: {
          owner: z.string(),
          repo: z.string(),
          buildNumber: z.number().optional(),
          limit: z.number().optional(),
        },
      },
      async (input) => {
        try {
          const owner = parseRequiredString(input.owner, "owner");
          const repo = parseRequiredString(input.repo, "repo");
          const buildNumber = parsePositiveInteger(input.buildNumber, "buildNumber");
          const limit = parsePositiveInteger(input.limit, "limit", { max: 100 });

          if (buildNumber !== undefined) {
            const snapshot = options.buildStateStore?.get(owner, repo, buildNumber);
            return toTextResult({ snapshot: snapshot ?? null });
          }

          const snapshots =
            options.buildStateStore?.listByRepo(owner, repo).slice(0, limit ?? 20) ?? [];
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
