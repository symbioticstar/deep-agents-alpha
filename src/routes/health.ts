import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
    };
  });
}
