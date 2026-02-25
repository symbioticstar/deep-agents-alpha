import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredTool } from "langchain";
import type { Connection } from "@langchain/mcp-adapters";

import type { Logger } from "./logger.js";

export interface McpTooling {
  client?: MultiServerMCPClient;
  tools: StructuredTool[];
}

export async function createMcpTooling(options: {
  mcpServers: Record<string, Connection>;
  debug: boolean;
  logger: Logger;
}): Promise<McpTooling> {
  if (Object.keys(options.mcpServers).length === 0) {
    return { tools: [] };
  }

  const client = new MultiServerMCPClient({
    onConnectionError: "ignore",
    mcpServers: options.mcpServers,
  });

  if (options.debug) {
    try {
      await client.setLoggingLevel("debug");
    } catch (error) {
      options.logger.debug("Unable to set MCP logging level", { error });
    }
  }

  const tools = await client.getTools();

  options.logger.info("MCP tools loaded", {
    servers: Object.keys(options.mcpServers),
    tools: tools.map((tool) => tool.name),
  });

  return {
    client,
    tools,
  };
}
