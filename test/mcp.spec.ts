import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadMcpConfig } from "../src/config/mcp.js";
import { createLogger } from "../src/lib/logger.js";

describe("loadMcpConfig", () => {
  it("parses stdio and http servers with enabled filter", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "deep-agents-mcp-"));
    const configPath = path.join(root, "mcp.test.yaml");

    writeFileSync(
      configPath,
      [
        "servers:",
        "  - name: math",
        "    transport: stdio",
        "    command: npx",
        "    args: ['-y', '@modelcontextprotocol/server-math']",
        "  - name: web",
        "    transport: http",
        "    url: https://example.com/mcp",
      ].join("\n"),
      "utf8",
    );

    const parsed = loadMcpConfig({
      configPath,
      enabledServers: ["math"],
      disabledServers: [],
      logger: createLogger(false),
    });

    expect(parsed.enabledServers).toEqual(["math"]);
    expect(Object.keys(parsed.mcpServers)).toEqual(["math"]);
  });
});
