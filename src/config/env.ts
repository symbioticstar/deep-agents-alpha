import { resolve } from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

import type { AppConfig } from "../types/config.js";

dotenv.config();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  DEBUG: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  MCP_CONFIG_PATH: z.string().optional(),
  MCP_ENABLED_SERVERS: z.string().optional(),
  MCP_DISABLED_SERVERS: z.string().optional(),
  SKILLS_DIRS: z.string().optional(),
  REMOTE_SKILLS_ENABLED: z.string().optional(),
  REMOTE_SKILLS_REPOS: z.string().optional(),
  API_AUTH_TOKEN: z.string().optional(),
});

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadAppConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  const projectRoot = process.cwd();
  const parsedSkills = parseCsv(env.SKILLS_DIRS);

  const config: AppConfig = {
    debug: parseBoolean(env.DEBUG, false),
    port: env.PORT ?? 3000,
    projectRoot,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
    },
    mcpConfigPath: resolve(projectRoot, env.MCP_CONFIG_PATH ?? "./mcp.config.yaml"),
    mcpEnabledServers: parseCsv(env.MCP_ENABLED_SERVERS),
    mcpDisabledServers: parseCsv(env.MCP_DISABLED_SERVERS),
    skillsDirs: parsedSkills.length ? parsedSkills : ["./skills"],
    remoteSkillsEnabled: parseBoolean(env.REMOTE_SKILLS_ENABLED, false),
    remoteSkillsRepos: env.REMOTE_SKILLS_REPOS ?? "",
  };

  const token = env.API_AUTH_TOKEN?.trim();
  if (token) {
    config.apiAuthToken = token;
  }

  return config;
}
