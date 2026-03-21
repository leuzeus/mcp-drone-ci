import test from "node:test";
import assert from "node:assert/strict";
import { DroneClient } from "../drone/client";
import { BuildStateStore } from "../state/build-state-store";
import { createCiResources } from "../mcp/resources/ci-resources";

test("latest resource returns cached build without API call when available", async () => {
  let calls = 0;
  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "token",
    timeoutMs: 1000,
    maxRetries: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const store = new BuildStateStore();
  store.upsertFromBuild({
    owner: "acme",
    repo: "api",
    number: 77,
    status: "running",
    event: "push",
    createdAtUnix: 1700000000,
  });

  const resources = createCiResources(client, { buildStateStore: store });
  const latest = resources.find(
    (resource) => resource.uriTemplate === "drone://repo/{owner}/{repo}/latest"
  );

  assert.ok(latest);
  const data = await latest.read({
    owner: "acme",
    repo: "api",
  });

  const payload = data as { source: string; latestBuild: { number: number } };
  assert.equal(payload.source, "cache");
  assert.equal(payload.latestBuild.number, 77);
  assert.equal(calls, 0);
});

test("build summary resource falls back to API and updates cache", async () => {
  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "token",
    timeoutMs: 1000,
    maxRetries: 0,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          number: 88,
          status: "success",
          event: "push",
          created: 1700000000,
          finished: 1700000010,
          repo_namespace: "acme",
          repo_name: "api",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
  });

  const store = new BuildStateStore();
  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 88,
    status: "running",
    updatedAtUnix: 1700000000,
  });

  const resources = createCiResources(client, { buildStateStore: store });
  const summary = resources.find(
    (resource) =>
      resource.uriTemplate === "drone://repo/{owner}/{repo}/build/{buildNumber}/summary"
  );

  assert.ok(summary);
  const data = await summary.read({
    owner: "acme",
    repo: "api",
    buildNumber: 88,
  });

  const payload = data as { source: string; build: { status: string } };
  assert.equal(payload.source, "api");
  assert.equal(payload.build.status, "success");

  const cached = store.get("acme", "api", 88);
  assert.ok(cached?.build);
  assert.equal(cached?.build?.status, "success");
});

test("latest resource prefers highest build number over most recent cache update", async () => {
  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "token",
    timeoutMs: 1000,
    maxRetries: 0,
    fetchImpl: async () => {
      throw new Error("API should not be called");
    },
  });

  const store = new BuildStateStore();
  store.upsertFromBuild({
    owner: "acme",
    repo: "api",
    number: 100,
    status: "success",
    event: "push",
    createdAtUnix: 1700000100,
  }, 1700000100);
  store.upsertFromBuild({
    owner: "acme",
    repo: "api",
    number: 99,
    status: "failure",
    event: "push",
    createdAtUnix: 1700000000,
  }, 1700000200);

  const resources = createCiResources(client, { buildStateStore: store });
  const latest = resources.find(
    (resource) => resource.uriTemplate === "drone://repo/{owner}/{repo}/latest"
  );

  assert.ok(latest);
  const data = await latest.read({
    owner: "acme",
    repo: "api",
  });

  const payload = data as { source: string; latestBuild: { number: number } };
  assert.equal(payload.source, "cache");
  assert.equal(payload.latestBuild.number, 100);
});

test("latest resource keeps cached build details aligned with status-only updates", async () => {
  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "token",
    timeoutMs: 1000,
    maxRetries: 0,
    fetchImpl: async () => {
      throw new Error("API should not be called");
    },
  });

  const store = new BuildStateStore();
  store.upsertFromBuild({
    owner: "acme",
    repo: "api",
    number: 77,
    status: "running",
    event: "push",
    createdAtUnix: 1700000000,
  }, 1700000000);
  store.upsert({
    owner: "acme",
    repo: "api",
    buildNumber: 77,
    status: "success",
    updatedAtUnix: 1700000005,
  });

  const resources = createCiResources(client, { buildStateStore: store });
  const latest = resources.find(
    (resource) => resource.uriTemplate === "drone://repo/{owner}/{repo}/latest"
  );

  assert.ok(latest);
  const data = await latest.read({
    owner: "acme",
    repo: "api",
  });

  const payload = data as { latestBuild: { status: string } };
  assert.equal(payload.latestBuild.status, "success");
});
