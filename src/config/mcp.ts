import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Connection } from "@langchain/mcp-adapters";
import YAML from "yaml";
import { z } from "zod";

import type { Logger } from "../lib/logger.js";
import type { ParsedMcpConfig } from "../types/config.js";

const commonSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  transport: z.enum(["stdio", "http", "sse"]),
});

const stdioSchema = commonSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});

const remoteSchema = commonSchema.extend({
  transport: z.enum(["http", "sse"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

const mcpFileSchema = z.object({
  servers: z
    .array(z.union([stdioSchema, remoteSchema]))
    .optional()
    .default([]),
});

function interpolateEnvironment(input: string): string {
  return input.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => {
    return process.env[key] ?? "";
  });
}

function parseMcpFile(path: string): z.infer<typeof mcpFileSchema> {
  const raw = readFileSync(path, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  return mcpFileSchema.parse(parsed);
}

function buildConnection(
  server: z.infer<typeof stdioSchema> | z.infer<typeof remoteSchema>,
): Connection {
  if (server.transport === "stdio") {
    return {
      transport: "stdio",
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
    };
  }

  return {
    transport: server.transport,
    url: interpolateEnvironment(server.url),
    headers: server.headers
      ? Object.fromEntries(
          Object.entries(server.headers).map(([key, value]) => [
            key,
            interpolateEnvironment(value),
          ]),
        )
      : undefined,
  };
}

export function loadMcpConfig(options: {
  configPath: string;
  enabledServers: string[];
  disabledServers: string[];
  logger: Logger;
}): ParsedMcpConfig {
  const sourcePath = resolve(options.configPath);

  if (!existsSync(sourcePath)) {
    options.logger.warn("MCP config file does not exist, skip MCP tools", {
      sourcePath,
    });

    return {
      sourcePath,
      enabledServers: [],
      mcpServers: {},
    };
  }

  const file = parseMcpFile(sourcePath);
  const enabledSet = new Set(options.enabledServers);
  const disabledSet = new Set(options.disabledServers);

  const mcpServers: Record<string, Connection> = {};
  const enabledServers: string[] = [];

  for (const server of file.servers) {
    if (!server.enabled) {
      continue;
    }

    if (enabledSet.size > 0 && !enabledSet.has(server.name)) {
      continue;
    }

    if (disabledSet.has(server.name)) {
      continue;
    }

    mcpServers[server.name] = buildConnection(server);
    enabledServers.push(server.name);
  }

  options.logger.debug("Loaded MCP config", {
    sourcePath,
    enabledServers,
  });

  return {
    sourcePath,
    enabledServers,
    mcpServers,
  };
}
