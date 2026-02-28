import { DroneBuildStatus } from "../types/drone";

export type WorkflowDecision = "wait" | "continue" | "collect_logs_and_stop";

export interface ReactionPolicyResult {
  decision: WorkflowDecision;
  reason: string;
}

export function decideWorkflowReaction(
  status: DroneBuildStatus
): ReactionPolicyResult {
  switch (status) {
    case "pending":
    case "running":
    case "blocked":
      return {
        decision: "wait",
        reason: `Build is ${status}. Continue monitoring.`,
      };
    case "success":
      return {
        decision: "continue",
        reason: "Build succeeded. Workflow can continue.",
      };
    case "failure":
    case "error":
    case "killed":
      return {
        decision: "collect_logs_and_stop",
        reason: `Build ended with ${status}. Collect logs and stop.`,
      };
    default:
      return {
        decision: "wait",
        reason: "Unknown status. Keep monitoring.",
      };
  }
}
