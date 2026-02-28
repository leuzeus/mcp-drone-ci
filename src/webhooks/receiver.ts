import { DroneBuildStatus } from "../types/drone";
import { createHmac, timingSafeEqual } from "crypto";

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

    const provided = this.normalizeSignature(signature);
    if (!provided) {
      return false;
    }

    const expected = createHmac("sha256", this.secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(provided, "hex");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
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

  private normalizeSignature(raw: string): string | null {
    const value = raw.trim().toLowerCase();
    const candidate = value.startsWith("sha256=")
      ? value.slice("sha256=".length)
      : value;

    return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
  }
}
