import { DroneClient } from "../../drone/client";
import { BuildStateStore } from "../../state/build-state-store";
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

export interface CiResourcesOptions {
  buildStateStore?: BuildStateStore;
}

export function createCiResources(
  client: DroneClient,
  options: CiResourcesOptions = {}
): Array<McpResourceDefinition<any, any>> {
  const latestBuild: McpResourceDefinition<RepoQuery, unknown> = {
    uriTemplate: "drone://repo/{owner}/{repo}/latest",
    description: "Latest build details for a repository.",
    read: async (query) => {
      const latestCached = options.buildStateStore?.getLatestByRepo(query.owner, query.repo);

      if (latestCached?.build) {
        return {
          owner: query.owner,
          repo: query.repo,
          source: "cache",
          latestBuild: latestCached.build,
          cachedUpdatedAtUnix: latestCached.updatedAtUnix,
        };
      }

      if (latestCached) {
        const build = await client.getBuild(query.owner, query.repo, latestCached.buildNumber);
        options.buildStateStore?.upsertFromBuild(build);
        return {
          owner: query.owner,
          repo: query.repo,
          source: "cache_build_number_with_api_refresh",
          latestBuild: build,
          cachedUpdatedAtUnix: latestCached.updatedAtUnix,
        };
      }

      const builds = await client.listBuilds(query.owner, query.repo, 1, 1);
      const latest = builds[0] ?? null;
      if (latest) {
        options.buildStateStore?.upsertFromBuild(latest);
      }

      return {
        owner: query.owner,
        repo: query.repo,
        source: "api",
        latestBuild: latest,
      };
    },
  };

  const buildSummary: McpResourceDefinition<BuildQuery, unknown> = {
    uriTemplate: "drone://repo/{owner}/{repo}/build/{buildNumber}/summary",
    description: "Build summary by repository and build number.",
    read: async (query) => {
      const cached = options.buildStateStore?.get(query.owner, query.repo, query.buildNumber);
      if (cached?.build) {
        return {
          owner: query.owner,
          repo: query.repo,
          source: "cache",
          build: cached.build,
          cachedUpdatedAtUnix: cached.updatedAtUnix,
        };
      }

      const build = await client.getBuild(query.owner, query.repo, query.buildNumber);
      options.buildStateStore?.upsertFromBuild(build);

      return {
        owner: query.owner,
        repo: query.repo,
        source: "api",
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
        source: "api",
        log,
      };
    },
  };

  return [latestBuild, buildSummary, buildStepLogs];
}
