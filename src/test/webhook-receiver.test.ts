import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WebhookReceiver } from "../webhooks/receiver";

test("verifySignature accepts valid sha256 signatures", () => {
  const secret = "super-secret";
  const rawBody = JSON.stringify({ hello: "world" });
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const receiver = new WebhookReceiver(secret);

  assert.equal(receiver.verifySignature(rawBody, digest), true);
  assert.equal(receiver.verifySignature(rawBody, `sha256=${digest}`), true);
});

test("verifySignature rejects invalid or missing signatures", () => {
  const receiver = new WebhookReceiver("super-secret");
  const rawBody = JSON.stringify({ hello: "world" });

  assert.equal(receiver.verifySignature(rawBody, undefined), false);
  assert.equal(receiver.verifySignature(rawBody, "sha256=bad"), false);
  assert.equal(receiver.verifySignature(rawBody, "0".repeat(64)), false);
});

test("parseEvent extracts build context", () => {
  const receiver = new WebhookReceiver("secret");

  const parsed = receiver.parseEvent(
    { event: "build:updated" },
    {
      action: "updated",
      repository: { namespace: "acme", name: "payments" },
      build: { number: 42, status: "running" },
    }
  );

  assert.equal(parsed.type, "build");
  assert.equal(parsed.action, "updated");
  assert.equal(parsed.owner, "acme");
  assert.equal(parsed.repo, "payments");
  assert.equal(parsed.buildNumber, 42);
  assert.equal(parsed.status, "running");
});
