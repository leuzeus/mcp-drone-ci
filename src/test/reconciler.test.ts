import test from "node:test";
import assert from "node:assert/strict";
import { DroneClient } from "../drone/client";
import { BuildStateStore } from "../state/build-state-store";
import { BuildStateReconciler } from "../state/reconciler";

test("reconciler refreshes active builds from Drone API", async () => {
  const store = new BuildStateStore();
  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 55,
    status: "running",
    updatedAtUnix: 1700000000,
  });

  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "token",
    timeoutMs: 1000,
    maxRetries: 0,
    maxResponseBytes: 2_000_000,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          number: 55,
          status: "success",
          event: "push",
          created: 1700000000,
          started: 1700000001,
          finished: 1700000010,
          repo_namespace: "acme",
          repo_name: "api",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
  });

  const reconciler = new BuildStateReconciler(client, store, {
    intervalMs: 5000,
  });

  await reconciler.reconcileOnce();

  const snapshot = store.get("acme", "api", 55);
  assert.ok(snapshot);
  assert.equal(snapshot.status, "success");
  assert.ok(snapshot.build);
  assert.equal(snapshot.build?.number, 55);
});
