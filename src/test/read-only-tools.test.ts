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
    async listBuilds(...args: unknown[]) {
      calls.push(args);
      return [
        createBuild({
          number: 102,
          event: "pull_request",
          prNumber: 501,
          sourceBranch: "feature-b",
          target: "main",
        }),
      ];
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
