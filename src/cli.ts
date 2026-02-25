import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input } from "node:process";

import { loadAppConfig } from "./config/env.js";
import { createAgentRuntime } from "./lib/agent.js";
import { createLogger } from "./lib/logger.js";

interface CliArgs {
  interactive: boolean;
  prompt: string;
}

function parseCliArgs(args: string[]): CliArgs {
  let interactive = false;
  const promptParts: string[] = [];

  for (const arg of args) {
    if (arg === "--interactive" || arg === "-i") {
      interactive = true;
      continue;
    }

    promptParts.push(arg);
  }

  return {
    interactive,
    prompt: promptParts.join(" ").trim(),
  };
}

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

async function streamTurn(options: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  prompt: string;
  debug: boolean;
  threadId?: string;
  source: string;
}): Promise<void> {
  const runInput = {
    input: options.prompt,
    metadata: {
      source: options.source,
    },
    ...(options.threadId ? { threadId: options.threadId } : {}),
  };

  for await (const event of options.runtime.run({
    ...runInput,
  })) {
    if (event.type === "token") {
      process.stdout.write(event.text);
      continue;
    }

    if (event.type === "debug" && options.debug) {
      process.stderr.write(`[DEBUG] ${event.message}\n`);
      continue;
    }

    if (event.type === "tool_start" && options.debug) {
      process.stderr.write(`[TOOL_START] ${event.name}\n`);
      continue;
    }

    if (event.type === "tool_end" && options.debug) {
      process.stderr.write(`[TOOL_END] ${event.name}\n`);
      continue;
    }

    if (event.type === "error") {
      process.stderr.write(`[ERROR] ${event.message}\n`);
    }
  }

  process.stdout.write("\n");
}

async function runInteractive(options: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  debug: boolean;
}): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let threadId = process.env.THREAD_ID?.trim() || randomUUID();
  process.stderr.write(
    [`REPL started. threadId=${threadId}`, "Commands: /exit, /quit, /reset, /thread"].join("\n") +
      "\n",
  );

  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "/exit" || line === "/quit") {
        break;
      }

      if (line === "/thread") {
        process.stderr.write(`${threadId}\n`);
        continue;
      }

      if (line === "/reset") {
        threadId = randomUUID();
        process.stderr.write(`threadId reset: ${threadId}\n`);
        continue;
      }

      await streamTurn({
        runtime: options.runtime,
        prompt: line,
        debug: options.debug,
        threadId,
        source: "cli-repl",
      });
    }
  } finally {
    rl.close();
  }
}

async function runOnce(options: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  prompt: string;
  debug: boolean;
}): Promise<void> {
  const threadId = process.env.THREAD_ID?.trim();

  await streamTurn({
    runtime: options.runtime,
    prompt: options.prompt,
    debug: options.debug,
    source: "cli",
    ...(threadId ? { threadId } : {}),
  });
}

async function run(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const config = loadAppConfig();
  const logger = createLogger(config.debug);
  const runtime = await createAgentRuntime(config, logger);

  try {
    if (args.interactive) {
      await runInteractive({
        runtime,
        debug: config.debug,
      });
      return;
    }

    const stdinInput = await readStdin();
    const prompt = args.prompt || stdinInput;

    if (!prompt) {
      console.error('Usage: pnpm dev:cli -- "your prompt"');
      console.error("       pnpm dev:cli -- --interactive");
      process.exitCode = 1;
      return;
    }

    await runOnce({
      runtime,
      prompt,
      debug: config.debug,
    });
  } finally {
    await runtime.close();
  }
}

void run();
