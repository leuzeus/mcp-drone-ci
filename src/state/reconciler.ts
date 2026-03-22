import { DroneClient } from "../drone/client";
import { BuildStateStore } from "./build-state-store";

export interface BuildStateReconcilerConfig {
  intervalMs: number;
}

export class BuildStateReconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly droneClient: DroneClient,
    private readonly buildStateStore: BuildStateStore,
    private readonly config: BuildStateReconcilerConfig
  ) {}

  start(): void {
    if (this.timer || this.config.intervalMs <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.reconcileOnce();
    }, this.config.intervalMs);

    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  async reconcileOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const activeSnapshots = this.buildStateStore.listActive();

      for (const snapshot of activeSnapshots) {
        try {
          const build = await this.droneClient.getBuild(
            snapshot.owner,
            snapshot.repo,
            snapshot.buildNumber
          );
          this.buildStateStore.upsertFromBuild(build);
        } catch {
          // Best-effort reconciliation; keep existing snapshot if polling fails.
        }
      }
    } finally {
      this.running = false;
    }
  }
}
