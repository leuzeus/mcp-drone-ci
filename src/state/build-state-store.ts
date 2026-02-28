import { DroneBuild, DroneBuildStatus } from "../types/drone";

export interface BuildStateSnapshot {
  owner: string;
  repo: string;
  buildNumber: number;
  status: DroneBuildStatus;
  updatedAtUnix: number;
  build?: DroneBuild;
}

function buildKey(owner: string, repo: string, buildNumber: number): string {
  return `${owner}/${repo}#${buildNumber}`;
}

export class BuildStateStore {
  private readonly snapshots = new Map<string, BuildStateSnapshot>();

  upsert(snapshot: BuildStateSnapshot): void {
    const key = buildKey(snapshot.owner, snapshot.repo, snapshot.buildNumber);
    this.snapshots.set(key, snapshot);
  }

  get(
    owner: string,
    repo: string,
    buildNumber: number
  ): BuildStateSnapshot | undefined {
    return this.snapshots.get(buildKey(owner, repo, buildNumber));
  }

  listByRepo(owner: string, repo: string): BuildStateSnapshot[] {
    const prefix = `${owner}/${repo}#`;
    return Array.from(this.snapshots.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value)
      .sort((a, b) => b.updatedAtUnix - a.updatedAtUnix);
  }
}
