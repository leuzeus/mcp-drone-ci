import {
  DroneBuild,
  DroneBuildLogChunk,
  DroneBuildStatus,
  DroneRepo,
  DroneStepLogQuery,
} from "../types/drone";
import { DroneApiError } from "./errors";

export interface DroneClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  maxRetries: number;
  maxResponseBytes: number;
  fetchImpl?: typeof fetch;
}

export interface DroneBuildListFilters {
  prNumber?: number;
  sourceBranch?: string;
  targetBranch?: string;
}

export interface DroneBuildListResult {
  builds: DroneBuild[];
  incomplete: boolean;
  scannedPages: number;
}

interface RequestOptions {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_FILTER_SCAN_PAGES = 20;
const MAX_LIST_PAGE_SIZE = 100;
const DEFAULT_LIST_PAGE_SIZE = 25;
const DEFAULT_LOG_CHAR_LIMIT = 20_000;
const MAX_LOG_CHAR_LIMIT = 100_000;
const BUILD_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "running",
  "success",
  "failure",
  "error",
  "killed",
  "blocked",
]);

export class DroneClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly config: DroneClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  async listRepos(page = 1, limit = 25): Promise<DroneRepo[]> {
    const response = await this.requestJson<unknown>({
      method: "GET",
      path: "/api/user/repos",
      query: {
        page: this.normalizePositiveInteger(page, 1),
        per_page: this.normalizePageSize(limit),
      },
    });

    if (!Array.isArray(response)) {
      throw new DroneApiError(
        "Unexpected Drone response for listRepos.",
        502,
        "INVALID_RESPONSE",
        { response }
      );
    }

    return response.map((repo) => this.mapRepo(repo));
  }

  async listBuilds(
    owner: string,
    repo: string,
    page = 1,
    limit = 25,
    filters?: DroneBuildListFilters
  ): Promise<DroneBuild[]> {
    const result = await this.listBuildsDetailed(owner, repo, page, limit, filters);

    if (result.incomplete) {
      throw new DroneApiError(
        "Filtered build lookup reached the repository scan limit before exhaustion. Refine the filters or query a build directly.",
        409,
        "FILTER_SCAN_LIMIT_EXCEEDED",
        {
          owner,
          repo,
          filters,
          scannedPages: result.scannedPages,
          scanLimitPages: MAX_FILTER_SCAN_PAGES,
        }
      );
    }

    return result.builds;
  }

  async listBuildsDetailed(
    owner: string,
    repo: string,
    page = 1,
    limit = 25,
    filters?: DroneBuildListFilters
  ): Promise<DroneBuildListResult> {
    if (filters && this.hasBuildFilters(filters)) {
      return this.listBuildsWithFilters(owner, repo, page, limit, filters);
    }

    return {
      builds: await this.fetchBuildsPage(owner, repo, page, limit),
      incomplete: false,
      scannedPages: 1,
    };
  }

  private async listBuildsWithFilters(
    owner: string,
    repo: string,
    page: number,
    limit: number,
    filters: DroneBuildListFilters
  ): Promise<DroneBuildListResult> {
    const requestedLimit = this.normalizePageSize(limit);
    const pageSize = Math.min(Math.max(requestedLimit, DEFAULT_LIST_PAGE_SIZE), MAX_LIST_PAGE_SIZE);
    const matchingBuilds: DroneBuild[] = [];
    let currentPage = this.normalizePositiveInteger(page, 1);
    let scannedPages = 0;
    let morePagesLikely = false;

    while (matchingBuilds.length < requestedLimit && scannedPages < MAX_FILTER_SCAN_PAGES) {
      const builds = await this.fetchBuildsPage(owner, repo, currentPage, pageSize);
      matchingBuilds.push(...builds.filter((build) => this.matchesBuildFilters(build, filters)));
      scannedPages += 1;
      morePagesLikely = builds.length === pageSize;

      if (builds.length < pageSize) {
        break;
      }

      currentPage += 1;
    }

    return {
      builds: matchingBuilds.slice(0, requestedLimit),
      incomplete:
        matchingBuilds.length < requestedLimit &&
        scannedPages >= MAX_FILTER_SCAN_PAGES &&
        morePagesLikely,
      scannedPages,
    };
  }

  private async fetchBuildsPage(
    owner: string,
    repo: string,
    page: number,
    limit: number
  ): Promise<DroneBuild[]> {
    const response = await this.requestJson<unknown>({
      method: "GET",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds`,
      query: {
        page: this.normalizePositiveInteger(page, 1),
        per_page: this.normalizePageSize(limit),
      },
    });

    if (!Array.isArray(response)) {
      throw new DroneApiError(
        "Unexpected Drone response for listBuilds.",
        502,
        "INVALID_RESPONSE",
        { response }
      );
    }

    return response.map((build) => this.mapBuild(build, owner, repo));
  }

  async getBuild(owner: string, repo: string, buildNumber: number): Promise<DroneBuild> {
    const response = await this.requestJson<unknown>({
      method: "GET",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds/${buildNumber}`,
    });

    return this.mapBuild(response, owner, repo);
  }

  async getBuildLogs(query: DroneStepLogQuery): Promise<DroneBuildLogChunk> {
    const response = await this.requestJson<unknown>({
      method: "GET",
      path: `/api/repos/${encodeURIComponent(query.owner)}/${encodeURIComponent(
        query.repo
      )}/builds/${query.buildNumber}/logs/${query.stageNumber}/${query.stepNumber}`,
    });

    const fullContent = this.mapLogContent(response);
    const limitChars = this.normalizeLogCharLimit(query.limitChars);
    const shouldTruncate =
      Number.isFinite(limitChars) && fullContent.length > limitChars;

    return {
      stageNumber: query.stageNumber,
      stepNumber: query.stepNumber,
      content: shouldTruncate ? fullContent.slice(0, limitChars) : fullContent,
      truncated: shouldTruncate,
    };
  }

  async restartBuild(
    owner: string,
    repo: string,
    buildNumber: number
  ): Promise<DroneBuild> {
    const response = await this.requestJson<unknown>({
      method: "POST",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds/${buildNumber}`,
    });

    if (response === undefined || response === null) {
      return this.getBuild(owner, repo, buildNumber);
    }

    return this.mapBuild(response, owner, repo);
  }

  async stopBuild(owner: string, repo: string, buildNumber: number): Promise<DroneBuild> {
    const response = await this.requestJson<unknown>({
      method: "DELETE",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds/${buildNumber}`,
    });

    if (response === undefined || response === null) {
      return this.getBuild(owner, repo, buildNumber);
    }

    return this.mapBuild(response, owner, repo);
  }

  async approveBuild(
    owner: string,
    repo: string,
    buildNumber: number
  ): Promise<DroneBuild> {
    const response = await this.requestJson<unknown>({
      method: "POST",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds/${buildNumber}/approve`,
    });

    if (response === undefined || response === null) {
      return this.getBuild(owner, repo, buildNumber);
    }

    return this.mapBuild(response, owner, repo);
  }

  async declineBuild(
    owner: string,
    repo: string,
    buildNumber: number
  ): Promise<DroneBuild> {
    const response = await this.requestJson<unknown>({
      method: "POST",
      path: `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/builds/${buildNumber}/decline`,
    });

    if (response === undefined || response === null) {
      return this.getBuild(owner, repo, buildNumber);
    }

    return this.mapBuild(response, owner, repo);
  }

  private async requestJson<T>(options: RequestOptions): Promise<T | undefined> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await this.fetchImpl(this.buildUrl(options), {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.config.maxRetries) {
          clearTimeout(timeout);
          await this.delay(this.backoffMs(attempt));
          continue;
        }

        if (!response.ok) {
          throw await this.toApiError(response, options);
        }

        const textBody = await this.readResponseText(response);
        clearTimeout(timeout);
        if (!textBody.trim()) {
          return undefined;
        }

        try {
          return JSON.parse(textBody) as T;
        } catch {
          return textBody as T;
        }
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;

        const retryable =
          error instanceof DroneApiError
            ? RETRYABLE_STATUS_CODES.has(error.statusCode)
            : true;

        if (retryable && attempt < this.config.maxRetries) {
          await this.delay(this.backoffMs(attempt));
          continue;
        }

        if (error instanceof DroneApiError) {
          throw error;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          throw new DroneApiError(
            `Drone request timed out after ${this.config.timeoutMs}ms.`,
            408,
            "TIMEOUT",
            { options }
          );
        }

        throw new DroneApiError("Drone request failed.", 502, "NETWORK_ERROR", {
          options,
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new DroneApiError("Drone request failed after retries.", 502, "RETRY_EXHAUSTED", {
      options,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  private buildUrl(options: RequestOptions): string {
    const url = new URL(`${this.baseUrl}${options.path}`);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private async toApiError(response: Response, options: RequestOptions): Promise<DroneApiError> {
    const textBody = await this.readResponseText(
      response,
      Math.min(this.config.maxResponseBytes, 64_000)
    );
    let details: unknown = textBody;

    if (textBody.trim()) {
      try {
        details = JSON.parse(textBody);
      } catch {
        details = textBody;
      }
    }

    return new DroneApiError(
      `Drone API request failed with status ${response.status}.`,
      response.status,
      this.errorCodeFromStatus(response.status),
      {
        options,
        details,
      }
    );
  }

  private errorCodeFromStatus(statusCode: number): string {
    if (statusCode === 401) {
      return "UNAUTHORIZED";
    }
    if (statusCode === 403) {
      return "FORBIDDEN";
    }
    if (statusCode === 404) {
      return "NOT_FOUND";
    }
    if (statusCode === 409) {
      return "CONFLICT";
    }
    if (statusCode === 422) {
      return "VALIDATION_ERROR";
    }
    if (statusCode === 429) {
      return "RATE_LIMITED";
    }
    if (statusCode >= 500) {
      return "SERVER_ERROR";
    }
    return "HTTP_ERROR";
  }

  private mapRepo(raw: unknown): DroneRepo {
    if (!raw || typeof raw !== "object") {
      throw new DroneApiError("Invalid Drone repo payload.", 502, "INVALID_RESPONSE", {
        raw,
      });
    }

    const record = raw as Record<string, unknown>;
    const namespace = this.asString(record.namespace, "namespace");
    const name = this.asString(record.name, "name");

    return {
      owner: namespace,
      namespace,
      name,
      active: Boolean(record.active),
      private: Boolean(record.private),
    };
  }

  private mapBuild(raw: unknown, ownerHint: string, repoHint: string): DroneBuild {
    if (!raw || typeof raw !== "object") {
      throw new DroneApiError("Invalid Drone build payload.", 502, "INVALID_RESPONSE", {
        raw,
      });
    }

    const record = raw as Record<string, unknown>;
    const owner = this.firstString(record.repo_namespace, ownerHint);
    const repo = this.firstString(record.repo_name, repoHint);

    return {
      owner,
      repo,
      number: this.asNumber(record.number, "number"),
      prNumber: this.parsePrNumber(record),
      status: this.normalizeBuildStatus(record.status),
      event: this.firstString(record.event, ""),
      sourceBranch: this.optionalString(record.source),
      target: this.optionalString(record.target),
      message: this.optionalString(record.message),
      author: this.firstString(record.author_login, this.optionalString(record.author_name)),
      createdAtUnix: this.asNumber(record.created, "created"),
      startedAtUnix: this.optionalNumber(record.started),
      finishedAtUnix: this.optionalNumber(record.finished),
    };
  }

  private mapLogContent(raw: unknown): string {
    if (typeof raw === "string") {
      return raw;
    }

    if (Array.isArray(raw)) {
      return raw
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return "";
          }
          const out = (entry as Record<string, unknown>).out;
          return typeof out === "string" ? out : "";
        })
        .join("");
    }

    if (raw && typeof raw === "object") {
      const maybeOut = (raw as Record<string, unknown>).out;
      if (typeof maybeOut === "string") {
        return maybeOut;
      }
    }

    return "";
  }

  private normalizeBuildStatus(value: unknown): DroneBuildStatus {
    if (typeof value === "string" && BUILD_STATUSES.has(value)) {
      return value as DroneBuildStatus;
    }
    return "error";
  }

  private asString(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new DroneApiError(`Missing or invalid '${field}' in Drone response.`, 502, "INVALID_RESPONSE", {
        field,
        value,
      });
    }
    return value;
  }

  private asNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new DroneApiError(`Missing or invalid '${field}' in Drone response.`, 502, "INVALID_RESPONSE", {
        field,
        value,
      });
    }
    return value;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return "";
  }

  private hasBuildFilters(filters: DroneBuildListFilters): boolean {
    return (
      filters.prNumber !== undefined ||
      filters.sourceBranch !== undefined ||
      filters.targetBranch !== undefined
    );
  }

  private matchesBuildFilters(build: DroneBuild, filters: DroneBuildListFilters): boolean {
    if (filters.prNumber !== undefined && build.prNumber !== filters.prNumber) {
      return false;
    }

    if (filters.sourceBranch !== undefined && build.sourceBranch !== filters.sourceBranch) {
      return false;
    }

    if (filters.targetBranch !== undefined && build.target !== filters.targetBranch) {
      return false;
    }

    return true;
  }

  private parsePrNumber(record: Record<string, unknown>): number | undefined {
    const direct = this.optionalNumber(record.pull);
    if (direct !== undefined) {
      return direct;
    }

    const ref = this.optionalString(record.ref);
    const refMatch = ref?.match(/^refs\/pull\/(\d+)\/head$/);
    if (refMatch) {
      return Number(refMatch[1]);
    }

    const link = this.optionalString(record.link);
    const linkMatch = link?.match(/\/pull\/(\d+)(?:$|[/?#])/);
    if (linkMatch) {
      return Number(linkMatch[1]);
    }

    return undefined;
  }

  private backoffMs(attempt: number): number {
    return Math.min(250 * 2 ** attempt, 2000);
  }

  private normalizePositiveInteger(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || !Number.isInteger(value) || (value ?? 0) <= 0) {
      return fallback;
    }

    return value as number;
  }

  private normalizePageSize(value: number | undefined): number {
    return Math.min(
      this.normalizePositiveInteger(value, DEFAULT_LIST_PAGE_SIZE),
      MAX_LIST_PAGE_SIZE
    );
  }

  private normalizeLogCharLimit(value: number | undefined): number {
    return Math.min(
      this.normalizePositiveInteger(value, DEFAULT_LOG_CHAR_LIMIT),
      MAX_LOG_CHAR_LIMIT
    );
  }

  private async readResponseText(response: Response, maxBytes = this.config.maxResponseBytes): Promise<string> {
    const contentLength = response.headers.get("content-length");
    const declaredLength = contentLength ? Number(contentLength) : undefined;
    if (
      declaredLength !== undefined &&
      Number.isFinite(declaredLength) &&
      declaredLength > maxBytes
    ) {
      throw new DroneApiError(
        `Drone response exceeded the configured ${maxBytes}-byte limit.`,
        502,
        "RESPONSE_TOO_LARGE",
        { declaredLength, maxBytes }
      );
    }

    if (!response.body) {
      return response.text();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new DroneApiError(
          `Drone response exceeded the configured ${maxBytes}-byte limit.`,
          502,
          "RESPONSE_TOO_LARGE",
          { totalBytes, maxBytes }
        );
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
