import {
  DroneBuild,
  DroneBuildLogChunk,
  DroneRepo,
  DroneStepLogQuery,
} from "../types/drone";
import { DroneApiError } from "./errors";

export interface DroneClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  maxRetries: number;
}

export class DroneClient {
  constructor(private readonly config: DroneClientConfig) {}

  async listRepos(_page = 1, _limit = 25): Promise<DroneRepo[]> {
    return this.notImplemented("listRepos");
  }

  async listBuilds(
    _owner: string,
    _repo: string,
    _page = 1,
    _limit = 25
  ): Promise<DroneBuild[]> {
    return this.notImplemented("listBuilds");
  }

  async getBuild(
    _owner: string,
    _repo: string,
    _buildNumber: number
  ): Promise<DroneBuild> {
    return this.notImplemented("getBuild");
  }

  async getBuildLogs(_query: DroneStepLogQuery): Promise<DroneBuildLogChunk> {
    return this.notImplemented("getBuildLogs");
  }

  async restartBuild(
    _owner: string,
    _repo: string,
    _buildNumber: number
  ): Promise<DroneBuild> {
    return this.notImplemented("restartBuild");
  }

  async stopBuild(
    _owner: string,
    _repo: string,
    _buildNumber: number
  ): Promise<DroneBuild> {
    return this.notImplemented("stopBuild");
  }

  async approveBuild(
    _owner: string,
    _repo: string,
    _buildNumber: number
  ): Promise<DroneBuild> {
    return this.notImplemented("approveBuild");
  }

  async declineBuild(
    _owner: string,
    _repo: string,
    _buildNumber: number
  ): Promise<DroneBuild> {
    return this.notImplemented("declineBuild");
  }

  private async notImplemented<T>(method: string): Promise<T> {
    throw new DroneApiError(
      `DroneClient.${method} is not implemented yet.`,
      501,
      "NOT_IMPLEMENTED",
      {
        baseUrl: this.config.baseUrl,
      }
    );
  }
}
