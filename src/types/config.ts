import type { Connection } from "@langchain/mcp-adapters";

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppConfig {
  debug: boolean;
  port: number;
  projectRoot: string;
  openai: OpenAICompatibleConfig;
  mcpConfigPath: string;
  mcpEnabledServers: string[];
  mcpDisabledServers: string[];
  skillsDirs: string[];
  remoteSkillsEnabled: boolean;
  remoteSkillsRepos: string;
  apiAuthToken?: string;
}

export interface ParsedMcpConfig {
  sourcePath: string;
  enabledServers: string[];
  mcpServers: Record<string, Connection>;
}
