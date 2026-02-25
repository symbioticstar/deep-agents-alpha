import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AgentRuntime } from "../lib/agent.js";
import type { Logger } from "../lib/logger.js";
import { toSseFrame } from "../streams/agent-stream.js";

const requestSchema = z.object({
  input: z.string().min(1),
  threadId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function isAuthorized(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization;
  if (!header) {
    return false;
  }

  const [scheme, value] = header.split(" ");
  return scheme === "Bearer" && value === token;
}

export async function registerAgentStreamRoute(options: {
  app: FastifyInstance;
  runtime: AgentRuntime;
  logger: Logger;
  debug: boolean;
  apiAuthToken?: string;
}): Promise<void> {
  const { app, runtime, logger, debug, apiAuthToken } = options;

  app.post("/api/agent/stream", async (request, reply) => {
    if (apiAuthToken && !isAuthorized(request, apiAuthToken)) {
      return reply.code(401).send({
        error: "Unauthorized",
      });
    }

    const bodyResult = requestSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        issues: bodyResult.error.issues,
      });
    }

    const body = bodyResult.data;
    const abortController = new AbortController();

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(": ping\n\n");
      }
    }, 15_000);

    request.raw.on("close", () => {
      abortController.abort();
      clearInterval(heartbeat);
    });

    try {
      const runInput = {
        input: body.input,
        signal: abortController.signal,
        ...(body.threadId ? { threadId: body.threadId } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
      };

      for await (const event of runtime.run({
        ...runInput,
      })) {
        if (event.type === "debug" && !debug) {
          continue;
        }

        if (!reply.raw.destroyed) {
          reply.raw.write(toSseFrame(event));
        }
      }
    } catch (error) {
      logger.error("SSE request failed", {
        error,
      });
      if (!reply.raw.destroyed) {
        reply.raw.write(
          toSseFrame({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
            code: "SSE_ROUTE_FAILED",
          }),
        );
        reply.raw.write(
          toSseFrame({
            type: "done",
            finishReason: "error",
          }),
        );
      }
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });
}
