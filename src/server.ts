import Fastify, { type FastifyInstance } from "fastify";

import { loadAppConfig } from "./config/env.js";
import { createAgentRuntime, type AgentRuntime } from "./lib/agent.js";
import { createLogger, type Logger } from "./lib/logger.js";
import { registerAgentStreamRoute } from "./routes/agent-stream.js";
import { registerHealthRoute } from "./routes/health.js";
import type { AppConfig } from "./types/config.js";

function getOpenAIDomain(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

export async function buildServer(options?: {
  config?: AppConfig;
  logger?: Logger;
  runtime?: AgentRuntime;
}): Promise<FastifyInstance> {
  const config = options?.config ?? loadAppConfig();
  const logger = options?.logger ?? createLogger(config.debug);
  const runtime = options?.runtime ?? (await createAgentRuntime(config, logger));

  const app = Fastify({
    logger: false,
  });

  await registerHealthRoute(app);
  await registerAgentStreamRoute({
    app,
    runtime,
    logger,
    debug: config.debug,
    ...(config.apiAuthToken ? { apiAuthToken: config.apiAuthToken } : {}),
  });

  app.addHook("onClose", async () => {
    await runtime.close();
  });

  return app;
}

async function start(): Promise<void> {
  const config = loadAppConfig();
  const logger = createLogger(config.debug);
  const app = await buildServer({ config, logger });

  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.port,
    });
    logger.info("Server started", {
      port: config.port,
      openaiDomain: getOpenAIDomain(config.openai.baseUrl),
      openaiModel: config.openai.model,
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error,
    });
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
