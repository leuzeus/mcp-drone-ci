import { DroneClient } from "../../drone/client";
import { DroneBuild, DroneBuildLogChunk, DroneRepo } from "../../types/drone";
import { McpToolDefinition } from "../../types/mcp";

interface ListReposInput {
  page?: number;
  limit?: number;
}

interface ListReposOutput {
  repos: DroneRepo[];
}

interface ListBuildsInput {
  owner: string;
  repo: string;
  page?: number;
  limit?: number;
}

interface ListBuildsOutput {
  builds: DroneBuild[];
}

interface GetBuildInput {
  owner: string;
  repo: string;
  buildNumber: number;
}

interface GetBuildOutput {
  build: DroneBuild;
}

interface GetBuildLogsInput {
  owner: string;
  repo: string;
  buildNumber: number;
  stageNumber: number;
  stepNumber: number;
  limitChars?: number;
}

interface GetBuildLogsOutput {
  log: DroneBuildLogChunk;
}

export function createReadOnlyTools(
  client: DroneClient
): Array<McpToolDefinition<any, any>> {
  const listReposTool: McpToolDefinition<ListReposInput, ListReposOutput> = {
    name: "drone_list_repos",
    description: "List repositories visible to the Drone token.",
    execute: async (input) => ({
      repos: await client.listRepos(input.page, input.limit),
    }),
  };

  const listBuildsTool: McpToolDefinition<ListBuildsInput, ListBuildsOutput> = {
    name: "drone_list_builds",
    description: "List builds for a repository.",
    execute: async (input) => ({
      builds: await client.listBuilds(
        input.owner,
        input.repo,
        input.page,
        input.limit
      ),
    }),
  };

  const getBuildTool: McpToolDefinition<GetBuildInput, GetBuildOutput> = {
    name: "drone_get_build",
    description: "Get one build details by build number.",
    execute: async (input) => ({
      build: await client.getBuild(input.owner, input.repo, input.buildNumber),
    }),
  };

  const getBuildLogsTool: McpToolDefinition<GetBuildLogsInput, GetBuildLogsOutput> =
    {
      name: "drone_get_build_logs",
      description: "Get logs for one build stage/step.",
      execute: async (input) => ({
        log: await client.getBuildLogs({
          owner: input.owner,
          repo: input.repo,
          buildNumber: input.buildNumber,
          stageNumber: input.stageNumber,
          stepNumber: input.stepNumber,
          limitChars: input.limitChars,
        }),
      }),
    };

  return [listReposTool, listBuildsTool, getBuildTool, getBuildLogsTool];
}
