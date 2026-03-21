import test from "node:test";
import assert from "node:assert/strict";
import { createReadOnlyTools } from "../mcp/tools/read-only-tools";
import { DroneBuild } from "../types/drone";

function createBuild(overrides: Partial<DroneBuild>): DroneBuild {
  return {
    owner: "acme",
    repo: "api",
    number: 1,
    status: "success",
    event: "push",
    createdAtUnix: 1700000000,
    ...overrides,
  };
}

test("drone_list_builds forwards PR and branch filters to the client", async () => {
  const calls: unknown[] = [];
  const client = {
    async listRepos() {
      return [];
    },
    async listBuildsDetailed(...args: unknown[]) {
      calls.push(args);
      return {
        builds: [
          createBuild({
            number: 102,
            event: "pull_request",
            prNumber: 501,
            sourceBranch: "feature-b",
            target: "main",
          }),
        ],
        incomplete: false,
        scannedPages: 2,
      };
    },
    async getBuild() {
      throw new Error("not used");
    },
    async getBuildLogs() {
      throw new Error("not used");
    },
  } as unknown as any;

  const tool = createReadOnlyTools(client).find((entry) => entry.name === "drone_list_builds");
  assert.ok(tool);

  const output = await tool.execute(
    {
      owner: "acme",
      repo: "api",
      prNumber: 501,
      sourceBranch: "feature-b",
      targetBranch: "main",
    },
    { requestId: "req-1", caller: "test" }
  );

  assert.equal(output.source, "api");
  assert.equal(output.incomplete, false);
  assert.equal(output.scannedPages, 2);
  assert.equal(output.builds.length, 1);
  assert.equal(output.builds[0].number, 102);
  assert.equal("message" in output.builds[0], false);
  assert.deepEqual(calls, [
    [
      "acme",
      "api",
      undefined,
      undefined,
      {
        prNumber: 501,
        sourceBranch: "feature-b",
        targetBranch: "main",
      },
    ],
  ]);
});

test("drone_list_builds surfaces incomplete filtered searches", async () => {
  const client = {
    async listRepos() {
      return [];
    },
    async listBuildsDetailed() {
      return {
        builds: [],
        incomplete: true,
        scannedPages: 20,
      };
    },
    async getBuild() {
      throw new Error("not used");
    },
    async getBuildLogs() {
      throw new Error("not used");
    },
  } as unknown as any;

  const tool = createReadOnlyTools(client).find((entry) => entry.name === "drone_list_builds");
  assert.ok(tool);

  const output = await tool.execute(
    {
      owner: "acme",
      repo: "api",
      prNumber: 9999,
    },
    { requestId: "req-2", caller: "test" }
  );

  assert.equal(output.incomplete, true);
  assert.equal(output.scannedPages, 20);
  assert.match(output.warning, /scan limit/i);
});
