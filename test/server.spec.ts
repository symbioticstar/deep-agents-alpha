import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import type { AgentRuntime } from "../src/lib/agent.js";
import { createLogger } from "../src/lib/logger.js";
import type { AppConfig } from "../src/types/config.js";

const baseConfig: AppConfig = {
  debug: false,
  port: 0,
  projectRoot: process.cwd(),
  openai: {
    apiKey: "key",
    baseUrl: "https://example.com/v1",
    model: "model",
  },
  mcpConfigPath: "",
  mcpEnabledServers: [],
  mcpDisabledServers: [],
  skillsDirs: [],
  remoteSkillsEnabled: false,
  remoteSkillsRepos: "",
};

const fakeRuntime: AgentRuntime = {
  async *run() {
    yield { type: "token", text: "ok" };
    yield { type: "done", finishReason: "stop" };
  },
  async close() {
    return;
  },
};

describe("server", () => {
  it("returns health", async () => {
    const app = await buildServer({
      config: baseConfig,
      runtime: fakeRuntime,
      logger: createLogger(false),
    });

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns 401 when auth token is required", async () => {
    const app = await buildServer({
      config: {
        ...baseConfig,
        apiAuthToken: "secret",
      },
      runtime: fakeRuntime,
      logger: createLogger(false),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/stream",
      payload: { input: "hello" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("streams session event and thread header", async () => {
    const app = await buildServer({
      config: baseConfig,
      runtime: fakeRuntime,
      logger: createLogger(false),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/stream",
      payload: { input: "hello" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-thread-id"]).toEqual(expect.any(String));
    expect(response.body).toContain("event: session");
    expect(response.body).toContain('"threadId":"');
    await app.close();
  });
});
