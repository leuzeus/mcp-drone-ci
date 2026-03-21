import test from "node:test";
import assert from "node:assert/strict";
import { DroneClient } from "../drone/client";
import { DroneApiError } from "../drone/errors";

type MockFetch = typeof fetch;

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function createFetchMock(
  responder: (url: string, init?: RequestInit) => Promise<Response>
): { fetchImpl: MockFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl: MockFetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    calls.push({ url, init });
    return responder(url, init);
  };

  return { fetchImpl, calls };
}

function createClient(fetchImpl: MockFetch): DroneClient {
  return new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "test-token",
    timeoutMs: 1_000,
    maxRetries: 1,
    maxResponseBytes: 2_000_000,
    fetchImpl,
  });
}

test("listRepos maps payload and sets auth header", async () => {
  const { fetchImpl, calls } = createFetchMock(async () =>
    new Response(
      JSON.stringify([
        {
          namespace: "acme",
          name: "api",
          active: true,
          private: false,
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createClient(fetchImpl);
  const repos = await client.listRepos(2, 10);

  assert.equal(repos.length, 1);
  assert.equal(repos[0].owner, "acme");
  assert.equal(repos[0].name, "api");

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/user\/repos\?page=2&per_page=10$/);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-token");
});

test("getBuild retries once on 503 and then succeeds", async () => {
  let attempts = 0;
  const { fetchImpl } = createFetchMock(async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("service unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        number: 42,
        status: "success",
        event: "push",
        created: 1700000000,
        started: 1700000001,
        finished: 1700000002,
        repo_namespace: "acme",
        repo_name: "api",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const client = createClient(fetchImpl);
  const build = await client.getBuild("acme", "api", 42);

  assert.equal(attempts, 2);
  assert.equal(build.number, 42);
  assert.equal(build.status, "success");
});

test("getBuildLogs joins output and truncates when requested", async () => {
  const { fetchImpl } = createFetchMock(async () =>
    new Response(
      JSON.stringify([
        { pos: 0, out: "hello " },
        { pos: 1, out: "world" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createClient(fetchImpl);
  const logs = await client.getBuildLogs({
    owner: "acme",
    repo: "api",
    buildNumber: 7,
    stageNumber: 1,
    stepNumber: 2,
    limitChars: 8,
  });

  assert.equal(logs.content, "hello wo");
  assert.equal(logs.truncated, true);
});

test("getBuildLogs applies a safe default limit when none is provided", async () => {
  const { fetchImpl } = createFetchMock(async () =>
    new Response(
      JSON.stringify([{ pos: 0, out: "a".repeat(25_000) }]),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createClient(fetchImpl);
  const logs = await client.getBuildLogs({
    owner: "acme",
    repo: "api",
    buildNumber: 7,
    stageNumber: 1,
    stepNumber: 2,
  });

  assert.equal(logs.content.length, 20_000);
  assert.equal(logs.truncated, true);
});

test("restartBuild falls back to getBuild when API returns empty response", async () => {
  let callIndex = 0;
  const { fetchImpl, calls } = createFetchMock(async () => {
    callIndex += 1;
    if (callIndex === 1) {
      return new Response("", { status: 204 });
    }

    return new Response(
      JSON.stringify({
        number: 9,
        status: "running",
        event: "push",
        created: 1700000100,
        repo_namespace: "acme",
        repo_name: "api",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const client = createClient(fetchImpl);
  const build = await client.restartBuild("acme", "api", 9);

  assert.equal(build.number, 9);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/repos\/acme\/api\/builds\/9$/);
  assert.match(calls[1].url, /\/api\/repos\/acme\/api\/builds\/9$/);
});

test("maps 404 response to DroneApiError", async () => {
  const { fetchImpl } = createFetchMock(async () =>
    new Response(JSON.stringify({ message: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  );

  const client = createClient(fetchImpl);

  await assert.rejects(
    () => client.getBuild("acme", "missing", 1),
    (error: unknown) => {
      assert.ok(error instanceof DroneApiError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    }
  );
});

test("rejects oversized Drone responses", async () => {
  const { fetchImpl } = createFetchMock(async () =>
    new Response("x".repeat(128), {
      status: 200,
      headers: { "content-length": "128", "content-type": "text/plain" },
    })
  );

  const client = new DroneClient({
    baseUrl: "https://drone.example.com",
    token: "test-token",
    timeoutMs: 1_000,
    maxRetries: 0,
    maxResponseBytes: 64,
    fetchImpl,
  });

  await assert.rejects(
    () => client.getBuild("acme", "api", 1),
    (error: unknown) => {
      assert.ok(error instanceof DroneApiError);
      assert.equal(error.code, "RESPONSE_TOO_LARGE");
      return true;
    }
  );
});

test("listBuilds filters by PR and branch metadata across pages", async () => {
  const { fetchImpl, calls } = createFetchMock(async (url) => {
    const parsedUrl = new URL(url);
    const page = parsedUrl.searchParams.get("page");

    if (page === "1") {
      return new Response(
        JSON.stringify(
          Array.from({ length: 25 }, (_, index) => ({
            number: index + 1,
            status: "success",
            event: "pull_request",
            created: 1700000000 + index,
            repo_namespace: "acme",
            repo_name: "api",
            source: "feature-a",
            target: "main",
            ref: `refs/pull/${index + 1}/head`,
          }))
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify([
        {
          number: 44,
          status: "failure",
          event: "pull_request",
          created: 1700000100,
          repo_namespace: "acme",
          repo_name: "api",
          source: "feature-b",
          target: "main",
          ref: "refs/pull/44/head",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  const client = createClient(fetchImpl);
  const builds = await client.listBuilds("acme", "api", 1, 1, {
    prNumber: 44,
    sourceBranch: "feature-b",
    targetBranch: "main",
  });

  assert.equal(builds.length, 1);
  assert.equal(builds[0].number, 44);
  assert.equal(builds[0].prNumber, 44);
  assert.equal(builds[0].sourceBranch, "feature-b");
  assert.equal(builds[0].target, "main");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/repos\/acme\/api\/builds\?page=1&per_page=25$/);
  assert.match(calls[1].url, /\/api\/repos\/acme\/api\/builds\?page=2&per_page=25$/);
});

test("listBuilds filtered lookup stops after a bounded number of pages", async () => {
  const { fetchImpl, calls } = createFetchMock(async () =>
    new Response(
      JSON.stringify(
        Array.from({ length: 25 }, (_, index) => ({
          number: index + 1,
          status: "success",
          event: "pull_request",
          created: 1700000000 + index,
          repo_namespace: "acme",
          repo_name: "api",
          source: "feature-a",
          target: "main",
          ref: `refs/pull/${index + 1}/head`,
        }))
      ),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createClient(fetchImpl);
  await assert.rejects(
    () =>
      client.listBuilds("acme", "api", 1, 1, {
        prNumber: 9999,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DroneApiError);
      assert.equal(error.code, "FILTER_SCAN_LIMIT_EXCEEDED");
      return true;
    }
  );

  assert.equal(calls.length, 20);
});

test("listBuildsDetailed reports incomplete filtered searches without a silent false negative", async () => {
  const { fetchImpl, calls } = createFetchMock(async () =>
    new Response(
      JSON.stringify(
        Array.from({ length: 25 }, (_, index) => ({
          number: index + 1,
          status: "success",
          event: "pull_request",
          created: 1700000000 + index,
          repo_namespace: "acme",
          repo_name: "api",
          source: "feature-a",
          target: "main",
          ref: `refs/pull/${index + 1}/head`,
        }))
      ),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const client = createClient(fetchImpl);
  const result = await client.listBuildsDetailed("acme", "api", 1, 1, {
    prNumber: 9999,
  });

  assert.equal(result.builds.length, 0);
  assert.equal(result.incomplete, true);
  assert.equal(result.scannedPages, 20);
  assert.equal(calls.length, 20);
});
