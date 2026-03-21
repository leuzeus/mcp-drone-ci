import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { BuildStateStore } from "../state/build-state-store";
import { DroneBuild, DroneBuildStatus } from "../types/drone";
import { DroneWebhookPayload, WebhookReceiver } from "./receiver";

const DEFAULT_MAX_BODY_SIZE_BYTES = 1_000_000;

export interface WebhookHttpServerConfig {
  port: number;
  path: string;
  maxBodySizeBytes?: number;
}

interface StartWebhookServerArgs {
  config: WebhookHttpServerConfig;
  receiver: WebhookReceiver;
  buildStateStore: BuildStateStore;
}

function readSignatureHeader(req: IncomingMessage): string | undefined {
  const droneSignature = req.headers["x-drone-signature"];
  if (typeof droneSignature === "string") {
    return droneSignature;
  }

  const hubSignature = req.headers["x-hub-signature-256"];
  if (typeof hubSignature === "string") {
    return hubSignature;
  }

  return undefined;
}

function readEventHeader(req: IncomingMessage): string | undefined {
  const droneEvent = req.headers["x-drone-event"];
  if (typeof droneEvent === "string") {
    return droneEvent;
  }

  return undefined;
}

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBodySizeBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBodySizeBytes) {
        reject(new Error("Webhook payload exceeds maximum body size."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asDroneBuildStatus(value: unknown): DroneBuildStatus | undefined {
  const allowed: DroneBuildStatus[] = [
    "pending",
    "running",
    "success",
    "failure",
    "error",
    "killed",
    "blocked",
  ];

  return typeof value === "string" && allowed.includes(value as DroneBuildStatus)
    ? (value as DroneBuildStatus)
    : undefined;
}

function buildFromPayload(
  payload: DroneWebhookPayload,
  owner: string,
  repo: string
): DroneBuild | undefined {
  if (!payload.build) {
    return undefined;
  }

  const buildPayload = payload.build;
  const number = asNumber(buildPayload.number);
  const status = asDroneBuildStatus(buildPayload.status);
  const created = asNumber(buildPayload.created);
  const event = asString(buildPayload.event) ?? "webhook";

  if (number === undefined || status === undefined || created === undefined) {
    return undefined;
  }

  return {
    owner,
    repo,
    number,
    prNumber: asNumber(buildPayload.pull) ?? parsePrNumber(payload, buildPayload),
    status,
    event,
    sourceBranch: asString(buildPayload.source),
    target: asString(buildPayload.target),
    message: asString(buildPayload.message),
    author:
      asString(buildPayload.author_login) ??
      asString(buildPayload.author_name) ??
      asString(buildPayload.author),
    createdAtUnix: created,
    startedAtUnix: asNumber(buildPayload.started),
    finishedAtUnix: asNumber(buildPayload.finished),
  };
}

function parsePrNumber(
  payload: DroneWebhookPayload,
  buildPayload: Record<string, unknown>
): number | undefined {
  const ref = asString(buildPayload.ref) ?? asString(payload.ref);
  const refMatch = ref?.match(/^refs\/pull\/(\d+)\/head$/);
  if (refMatch) {
    return Number(refMatch[1]);
  }

  const link = asString(buildPayload.link) ?? asString(payload.link);
  const linkMatch = link?.match(/\/pull\/(\d+)(?:$|[/?#])/);
  if (linkMatch) {
    return Number(linkMatch[1]);
  }

  return undefined;
}

export async function startDroneWebhookHttpServer({
  config,
  receiver,
  buildStateStore,
}: StartWebhookServerArgs): Promise<Server> {
  const maxBodySizeBytes = config.maxBodySizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES;

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== config.path) {
      writeJson(res, 404, { error: "Not found" });
      return;
    }

    try {
      const rawBody = await readBody(req, maxBodySizeBytes);
      const signature = readSignatureHeader(req);

      if (!receiver.verifySignature(rawBody, signature)) {
        writeJson(res, 401, { error: "Invalid webhook signature" });
        return;
      }

      let payload: DroneWebhookPayload;
      try {
        payload = JSON.parse(rawBody) as DroneWebhookPayload;
      } catch {
        writeJson(res, 400, { error: "Invalid JSON payload" });
        return;
      }

      const parsed = receiver.parseEvent(
        {
          event: readEventHeader(req),
          signature,
        },
        payload
      );

      if (
        parsed.type === "build" &&
        parsed.owner &&
        parsed.repo &&
        parsed.buildNumber &&
        parsed.status
      ) {
        const build = buildFromPayload(payload, parsed.owner, parsed.repo);
        buildStateStore.upsert({
          owner: parsed.owner,
          repo: parsed.repo,
          buildNumber: parsed.buildNumber,
          status: parsed.status,
          updatedAtUnix: Math.floor(Date.now() / 1000),
          build,
        });
      }

      writeJson(res, 202, {
        accepted: true,
        type: parsed.type,
        action: parsed.action,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(res, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}
