import { DroneClient } from "../../drone/client";
import { McpResourceDefinition } from "../../types/mcp";

interface RepoQuery {
  owner: string;
  repo: string;
}

interface BuildQuery extends RepoQuery {
  buildNumber: number;
}

interface BuildLogQuery extends BuildQuery {
  stageNumber: number;
  stepNumber: number;
}

export function createCiResources(
  client: DroneClient
): Array<McpResourceDefinition<any, any>> {
  const latestBuild: McpResourceDefinition<RepoQuery, unknown> = {
    uriTemplate: "drone://repo/{owner}/{repo}/latest",
    description: "Latest build details for a repository.",
    read: async (query) => {
      const builds = await client.listBuilds(query.owner, query.repo, 1, 1);
      return {
        owner: query.owner,
        repo: query.repo,
        latestBuild: builds[0] ?? null,
      };
    },
  };

  const buildSummary: McpResourceDefinition<BuildQuery, unknown> = {
    uriTemplate: "drone://repo/{owner}/{repo}/build/{buildNumber}/summary",
    description: "Build summary by repository and build number.",
    read: async (query) => {
      const build = await client.getBuild(query.owner, query.repo, query.buildNumber);
      return {
        owner: query.owner,
        repo: query.repo,
        build,
      };
    },
  };

  const buildStepLogs: McpResourceDefinition<BuildLogQuery, unknown> = {
    uriTemplate:
      "drone://repo/{owner}/{repo}/build/{buildNumber}/logs/{stageNumber}/{stepNumber}",
    description: "One stage/step logs for a build.",
    read: async (query) => {
      const log = await client.getBuildLogs({
        owner: query.owner,
        repo: query.repo,
        buildNumber: query.buildNumber,
        stageNumber: query.stageNumber,
        stepNumber: query.stepNumber,
      });

      return {
        owner: query.owner,
        repo: query.repo,
        buildNumber: query.buildNumber,
        log,
      };
    },
  };

  return [latestBuild, buildSummary, buildStepLogs];
}
