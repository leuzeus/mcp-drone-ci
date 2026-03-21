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

function isActive(status: DroneBuildStatus): boolean {
  return status === "pending" || status === "running" || status === "blocked";
}

export class BuildStateStore {
  private readonly snapshots = new Map<string, BuildStateSnapshot>();

  upsert(snapshot: BuildStateSnapshot): void {
    const key = buildKey(snapshot.owner, snapshot.repo, snapshot.buildNumber);
    const previous = this.snapshots.get(key);
    const nextBuild =
      snapshot.build ??
      (previous?.build
        ? {
            ...previous.build,
            status: snapshot.status,
          }
        : undefined);

    this.snapshots.set(key, {
      ...previous,
      ...snapshot,
      build: nextBuild,
    });
  }

  upsertFromBuild(build: DroneBuild, updatedAtUnix = Math.floor(Date.now() / 1000)): void {
    this.upsert({
      owner: build.owner,
      repo: build.repo,
      buildNumber: build.number,
      status: build.status,
      updatedAtUnix,
      build,
    });
  }

  get(owner: string, repo: string, buildNumber: number): BuildStateSnapshot | undefined {
    return this.snapshots.get(buildKey(owner, repo, buildNumber));
  }

  listByRepo(owner: string, repo: string): BuildStateSnapshot[] {
    const prefix = `${owner}/${repo}#`;
    return Array.from(this.snapshots.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value)
      .sort((a, b) => b.updatedAtUnix - a.updatedAtUnix);
  }

  getLatestByRepo(owner: string, repo: string): BuildStateSnapshot | undefined {
    return this.listByRepo(owner, repo).sort((a, b) => {
      if (b.buildNumber !== a.buildNumber) {
        return b.buildNumber - a.buildNumber;
      }

      return b.updatedAtUnix - a.updatedAtUnix;
    })[0];
  }

  listAll(): BuildStateSnapshot[] {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => b.updatedAtUnix - a.updatedAtUnix
    );
  }

  listActive(): BuildStateSnapshot[] {
    return this.listAll().filter((snapshot) => isActive(snapshot.status));
  }
}
