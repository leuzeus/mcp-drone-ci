export type DroneBuildStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "error"
  | "killed"
  | "blocked";

export interface DroneRepo {
  owner: string;
  name: string;
  namespace: string;
  active: boolean;
  private: boolean;
}

export interface DroneBuild {
  owner: string;
  repo: string;
  number: number;
  status: DroneBuildStatus;
  event: string;
  target?: string;
  message?: string;
  author?: string;
  createdAtUnix: number;
  startedAtUnix?: number;
  finishedAtUnix?: number;
}

export interface DroneStepLogQuery {
  owner: string;
  repo: string;
  buildNumber: number;
  stageNumber: number;
  stepNumber: number;
  limitChars?: number;
}

export interface DroneBuildLogChunk {
  stageNumber: number;
  stepNumber: number;
  content: string;
  truncated: boolean;
}
