import test from "node:test";
import assert from "node:assert/strict";
import { decideWorkflowReaction } from "../workflows/reaction-policy";

test("policy returns wait for pending", () => {
  const result = decideWorkflowReaction("pending");
  assert.equal(result.decision, "wait");
});

test("policy returns continue for success", () => {
  const result = decideWorkflowReaction("success");
  assert.equal(result.decision, "continue");
});

test("policy returns collect_logs_and_stop for failures", () => {
  const result = decideWorkflowReaction("failure");
  assert.equal(result.decision, "collect_logs_and_stop");
});
