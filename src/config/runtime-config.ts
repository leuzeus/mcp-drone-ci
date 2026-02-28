import { DroneClientConfig } from "../drone/client";

export interface RuntimeConfig {
  drone: DroneClientConfig;
  webhook: {
    secret: string;
  };
}

export const defaultRuntimeConfig: RuntimeConfig = {
  drone: {
    baseUrl: "https://drone.example.com",
    token: "<set-token>",
    timeoutMs: 10_000,
    maxRetries: 2,
  },
  webhook: {
    secret: "<set-webhook-secret>",
  },
};
