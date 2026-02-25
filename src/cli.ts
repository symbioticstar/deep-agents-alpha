import { stdin as input } from "node:process";

import { loadAppConfig } from "./config/env.js";
import { createAgentRuntime } from "./lib/agent.js";
import { createLogger } from "./lib/logger.js";

async function readStdin(): Promise<string> {
  if (input.isTTY) {
    return "";
  }

  let content = "";
  for await (const chunk of input) {
    content += chunk.toString();
  }

  return content.trim();
}

async function run(): Promise<void> {
  const cliInput = process.argv.slice(2).join(" ").trim();
  const stdinInput = await readStdin();
  const prompt = cliInput || stdinInput;

  if (!prompt) {
    console.error('Usage: pnpm dev:cli -- "your prompt"');
    process.exitCode = 1;
    return;
  }

  const config = loadAppConfig();
  const logger = createLogger(config.debug);
  const runtime = await createAgentRuntime(config, logger);

  try {
    const runInput = {
      input: prompt,
      metadata: {
        source: "cli",
      },
      ...(process.env.THREAD_ID ? { threadId: process.env.THREAD_ID } : {}),
    };

    for await (const event of runtime.run({
      ...runInput,
    })) {
      if (event.type === "token") {
        process.stdout.write(event.text);
        continue;
      }

      if (event.type === "debug" && config.debug) {
        process.stderr.write(`[DEBUG] ${event.message}\n`);
        continue;
      }

      if (event.type === "tool_start" && config.debug) {
        process.stderr.write(`[TOOL_START] ${event.name}\n`);
        continue;
      }

      if (event.type === "tool_end" && config.debug) {
        process.stderr.write(`[TOOL_END] ${event.name}\n`);
        continue;
      }

      if (event.type === "error") {
        process.stderr.write(`[ERROR] ${event.message}\n`);
      }
    }

    process.stdout.write("\n");
  } finally {
    await runtime.close();
  }
}

void run();
