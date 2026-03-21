import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { AddressInfo } from "node:net";
import { BuildStateStore } from "../state/build-state-store";
import { startDroneWebhookHttpServer } from "../webhooks/http-server";
import { WebhookReceiver } from "../webhooks/receiver";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

test("webhook HTTP server accepts valid events and updates build state", async () => {
  const secret = "webhook-secret";
  const store = new BuildStateStore();

  const server = await startDroneWebhookHttpServer({
    config: {
      port: 0,
      path: "/webhook/drone",
    },
    receiver: new WebhookReceiver(secret),
    buildStateStore: store,
  });

  try {
    const address = server.address() as AddressInfo;
    const body = JSON.stringify({
      action: "updated",
      repository: {
        namespace: "acme",
        name: "api",
      },
      build: {
        number: 12,
        status: "running",
        event: "push",
        created: 1700000000,
        started: 1700000001,
        pull: 12,
        source: "feature-x",
        target: "main",
      },
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/webhook/drone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drone-event": "build:updated",
        "x-drone-signature": sign(secret, body),
      },
      body,
    });

    assert.equal(response.status, 202);
    const snapshot = store.get("acme", "api", 12);
    assert.ok(snapshot);
    assert.equal(snapshot.status, "running");
    assert.ok(snapshot.build);
    assert.equal(snapshot.build?.event, "push");
    assert.equal(snapshot.build?.prNumber, 12);
    assert.equal(snapshot.build?.sourceBranch, "feature-x");
    assert.equal(snapshot.build?.target, "main");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("webhook HTTP server rejects invalid signatures", async () => {
  const secret = "webhook-secret";
  const store = new BuildStateStore();

  const server = await startDroneWebhookHttpServer({
    config: {
      port: 0,
      path: "/webhook/drone",
    },
    receiver: new WebhookReceiver(secret),
    buildStateStore: store,
  });

  try {
    const address = server.address() as AddressInfo;
    const body = JSON.stringify({
      action: "updated",
      repository: {
        namespace: "acme",
        name: "api",
      },
      build: {
        number: 12,
        status: "running",
      },
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/webhook/drone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drone-event": "build:updated",
        "x-drone-signature": "sha256=bad",
      },
      body,
    });

    assert.equal(response.status, 401);
    assert.equal(store.get("acme", "api", 12), undefined);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("webhook HTTP server rejects non-JSON payloads before parsing", async () => {
  const secret = "webhook-secret";
  const store = new BuildStateStore();

  const server = await startDroneWebhookHttpServer({
    config: {
      port: 0,
      path: "/webhook/drone",
    },
    receiver: new WebhookReceiver(secret),
    buildStateStore: store,
  });

  try {
    const address = server.address() as AddressInfo;
    const body = "plain-text";

    const response = await fetch(`http://127.0.0.1:${address.port}/webhook/drone`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-drone-event": "build:updated",
        "x-drone-signature": sign(secret, body),
      },
      body,
    });

    assert.equal(response.status, 415);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
