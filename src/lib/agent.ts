import { randomUUID } from "node:crypto";

import { MemorySaver } from "@langchain/langgraph";
import { createDeepAgent } from "deepagents";

import { loadMcpConfig } from "../config/mcp.js";
import { resolveSkillSources } from "../config/skills.js";
import { streamAgentEvents, type AgentInvoker } from "../streams/agent-stream.js";
import type { AgentStreamEvent } from "../types/api.js";
import type { AppConfig } from "../types/config.js";
import { createMcpTooling } from "./mcp-client.js";
import { createChatModel } from "./model.js";
import type { Logger } from "./logger.js";
import { loadVirtualFilesFromDirectories, type VirtualFiles } from "./virtual-files.js";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a practical coding assistant.",
  "Prefer concise reasoning and explicit tool usage when needed.",
  "Use available MCP tools and skills when they help solve the user request.",
].join(" ");

export interface AgentRunInput {
  input: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AgentRuntime {
  run(input: AgentRunInput): AsyncGenerator<AgentStreamEvent>;
  close(): Promise<void>;
}

export async function createAgentRuntime(config: AppConfig, logger: Logger): Promise<AgentRuntime> {
  const mcpConfig = loadMcpConfig({
    configPath: config.mcpConfigPath,
    enabledServers: config.mcpEnabledServers,
    disabledServers: config.mcpDisabledServers,
    logger,
  });

  const mcpTooling = await createMcpTooling({
    mcpServers: mcpConfig.mcpServers,
    debug: config.debug,
    logger,
  });

  const resolvedSkills = resolveSkillSources({
    projectRoot: config.projectRoot,
    requestedDirs: config.skillsDirs,
    remoteSkillsEnabled: config.remoteSkillsEnabled,
    logger,
  });

  const preloadedSkillFiles =
    resolvedSkills.filesystemDirs.length > 0
      ? await loadVirtualFilesFromDirectories({
          projectRoot: config.projectRoot,
          directories: resolvedSkills.filesystemDirs,
          logger,
        })
      : {};

  const seedableSkillFileCount = Object.keys(preloadedSkillFiles).length;
  const seededThreads = new Set<string>();

  const agent = createDeepAgent({
    model: createChatModel(config),
    tools: mcpTooling.tools,
    checkpointer: new MemorySaver(),
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    ...(resolvedSkills.backendSkillSources.length > 0
      ? { skills: resolvedSkills.backendSkillSources }
      : {}),
  }) as unknown as AgentInvoker;

  logger.info("Agent runtime initialized", {
    mcpServers: mcpConfig.enabledServers,
    skillSources: resolvedSkills.backendSkillSources,
    skillFilesPreloaded: seedableSkillFileCount,
    sessionMemory: "in-memory-checkpointer",
  });

  return {
    async *run(input: AgentRunInput): AsyncGenerator<AgentStreamEvent> {
      const threadId = input.threadId?.trim() || randomUUID();
      const shouldSeedSkillFiles = seedableSkillFileCount > 0 && !seededThreads.has(threadId);

      if (shouldSeedSkillFiles) {
        seededThreads.add(threadId);
      }

      try {
        const streamInput = {
          agent,
          input: input.input,
          threadId,
          ...(shouldSeedSkillFiles ? { files: cloneVirtualFiles(preloadedSkillFiles) } : {}),
          debug: config.debug,
          logger,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        };

        yield* streamAgentEvents({
          ...streamInput,
        });
      } catch (error) {
        logger.error("Agent stream failed", { error });
        yield {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          code: "AGENT_STREAM_FAILED",
        };
        yield {
          type: "done",
          finishReason: "error",
        };
      }
    },
    async close() {
      if (mcpTooling.client) {
        await mcpTooling.client.close();
      }
    },
  };
}

function cloneVirtualFiles(files: VirtualFiles): VirtualFiles {
  return structuredClone(files);
}
