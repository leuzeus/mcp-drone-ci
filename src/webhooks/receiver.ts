import { DroneBuildStatus } from "../types/drone";

export type DroneWebhookEventType = "build" | "repo" | "unknown";

export interface DroneWebhookHeaders {
  event?: string;
  signature?: string;
}

export interface DroneWebhookPayload {
  action?: string;
  repository?: {
    namespace?: string;
    name?: string;
  };
  build?: {
    number?: number;
    status?: DroneBuildStatus;
  };
  [key: string]: unknown;
}

export interface ParsedWebhookEvent {
  type: DroneWebhookEventType;
  action: string;
  owner?: string;
  repo?: string;
  buildNumber?: number;
  status?: DroneBuildStatus;
}

export class WebhookReceiver {
  constructor(private readonly secret: string) {}

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.secret) {
      return true;
    }

    if (!signature) {
      return false;
    }

    // Placeholder: replace with HMAC verification once HTTP integration is in place.
    return rawBody.length >= 0 && signature.length > 0;
  }

  parseEvent(
    headers: DroneWebhookHeaders,
    payload: DroneWebhookPayload
  ): ParsedWebhookEvent {
    const rawEvent = headers.event ?? "";
    const type: DroneWebhookEventType = rawEvent.startsWith("build")
      ? "build"
      : rawEvent.startsWith("repo")
      ? "repo"
      : "unknown";

    return {
      type,
      action: payload.action ?? rawEvent,
      owner: payload.repository?.namespace,
      repo: payload.repository?.name,
      buildNumber: payload.build?.number,
      status: payload.build?.status,
    };
  }
}
