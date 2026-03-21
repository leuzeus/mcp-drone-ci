import test from "node:test";
import assert from "node:assert/strict";
import { BuildStateStore } from "../state/build-state-store";

test("BuildStateStore evicts older snapshots per repository", () => {
  const store = new BuildStateStore({
    maxSnapshots: 10,
    maxSnapshotsPerRepo: 2,
  });

  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 1,
    status: "success",
    updatedAtUnix: 1,
  });
  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 2,
    status: "success",
    updatedAtUnix: 2,
  });
  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 3,
    status: "success",
    updatedAtUnix: 3,
  });

  assert.equal(store.get("acme", "api", 1), undefined);
  assert.ok(store.get("acme", "api", 2));
  assert.ok(store.get("acme", "api", 3));
});

test("BuildStateStore evicts older snapshots globally", () => {
  const store = new BuildStateStore({
    maxSnapshots: 2,
    maxSnapshotsPerRepo: 2,
  });

  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 1,
    status: "success",
    updatedAtUnix: 1,
  });
  store.upsert({
    owner: "acme",
    repo: "web",
    buildNumber: 1,
    status: "success",
    updatedAtUnix: 2,
  });
  store.upsert({
    owner: "acme",
    repo: "worker",
    buildNumber: 1,
    status: "success",
    updatedAtUnix: 3,
  });

  assert.equal(store.get("acme", "api", 1), undefined);
  assert.ok(store.get("acme", "web", 1));
  assert.ok(store.get("acme", "worker", 1));
});
