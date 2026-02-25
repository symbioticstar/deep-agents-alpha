import type { Logger } from "../lib/logger.js";
import type { AgentStreamEvent } from "../types/api.js";

export interface AgentInvoker {
  stream(
    input: unknown,
    options?: Record<string, unknown>,
  ): AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
}

interface StreamModeChunk {
  mode: string | null;
  payload: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractText(content: unknown): string[] {
  if (typeof content === "string") {
    return content ? [content] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      if (item) {
        parts.push(item);
      }
      continue;
    }

    if (!isRecord(item)) {
      continue;
    }

    const text = item.text;
    if (typeof text === "string" && text) {
      parts.push(text);
    }
  }

  return parts;
}

function* walkRecords(root: unknown): Generator<Record<string, unknown>> {
  const stack: unknown[] = [root];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!isRecord(current)) {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);
    yield current;

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) {
          stack.push(value[i]);
        }
        continue;
      }

      stack.push(value);
    }
  }
}

function normalizeChunk(rawChunk: unknown): StreamModeChunk {
  if (!Array.isArray(rawChunk)) {
    return { mode: null, payload: rawChunk };
  }

  if (rawChunk.length === 2 && typeof rawChunk[0] === "string") {
    return { mode: rawChunk[0], payload: rawChunk[1] };
  }

  if (rawChunk.length === 3 && Array.isArray(rawChunk[0]) && typeof rawChunk[1] === "string") {
    return { mode: rawChunk[1], payload: rawChunk[2] };
  }

  return { mode: null, payload: rawChunk };
}

function extractMessageCandidate(payload: unknown): unknown {
  if (Array.isArray(payload) && payload.length > 0) {
    return payload[0];
  }

  return payload;
}

function extractToolCalls(payload: unknown): Array<{ id?: string; name: string; input: unknown }> {
  const calls: Array<{ id?: string; name: string; input: unknown }> = [];

  for (const record of walkRecords(payload)) {
    const toolCalls = record.tool_calls;
    if (!Array.isArray(toolCalls)) {
      continue;
    }

    for (const entry of toolCalls) {
      if (!isRecord(entry)) {
        continue;
      }

      const name = entry.name;
      if (typeof name !== "string" || !name) {
        continue;
      }

      const args = entry.args ?? entry.input ?? {};
      const id = typeof entry.id === "string" ? entry.id : undefined;

      calls.push(id ? { id, name, input: args } : { name, input: args });
    }
  }

  return calls;
}

function extractToolResults(
  payload: unknown,
): Array<{ id?: string; name: string; output: unknown }> {
  const results: Array<{ id?: string; name: string; output: unknown }> = [];

  for (const record of walkRecords(payload)) {
    const maybeToolCallId = record.tool_call_id;
    const maybeName = record.name;
    const maybeType = record.type;

    if (typeof maybeToolCallId !== "string" && maybeType !== "tool") {
      continue;
    }

    const name = typeof maybeName === "string" && maybeName ? maybeName : "unknown_tool";
    const id = typeof maybeToolCallId === "string" ? maybeToolCallId : undefined;

    const output = record.content ?? record.output ?? null;
    results.push(id ? { id, name, output } : { name, output });
  }

  return results;
}

function createDebugEvent(enabled: boolean, message: string, data?: unknown): AgentStreamEvent[] {
  if (!enabled) {
    return [];
  }

  return [
    {
      type: "debug",
      message,
      data,
    },
  ];
}

export function toSseFrame(event: AgentStreamEvent): string {
  const { type, ...payload } = event;
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function* streamAgentEvents(options: {
  agent: AgentInvoker;
  input: string;
  threadId: string;
  metadata?: Record<string, unknown>;
  debug: boolean;
  logger: Logger;
  signal?: AbortSignal;
}): AsyncGenerator<AgentStreamEvent> {
  const startedTools = new Set<string>();
  const endedTools = new Set<string>();

  const stream = await options.agent.stream(
    {
      messages: [{ role: "user", content: options.input }],
    },
    {
      configurable: {
        thread_id: options.threadId,
        metadata: options.metadata ?? {},
      },
      streamMode: ["messages", "updates"],
      signal: options.signal,
    },
  );

  for await (const rawChunk of stream) {
    if (options.signal?.aborted) {
      yield {
        type: "done",
        finishReason: "aborted",
      };
      return;
    }

    const { mode, payload } = normalizeChunk(rawChunk);

    if (mode === "messages") {
      const message = extractMessageCandidate(payload);
      const textParts = isRecord(message) ? extractText(message.content) : [];

      for (const text of textParts) {
        yield {
          type: "token",
          text,
        };
      }
    }

    for (const call of extractToolCalls(payload)) {
      const identity = call.id ?? `${call.name}:${JSON.stringify(call.input)}`;
      if (startedTools.has(identity)) {
        continue;
      }

      startedTools.add(identity);
      yield call.id
        ? {
            type: "tool_start",
            id: call.id,
            name: call.name,
            input: call.input,
          }
        : {
            type: "tool_start",
            name: call.name,
            input: call.input,
          };
    }

    for (const result of extractToolResults(payload)) {
      const identity = result.id ?? `${result.name}:${JSON.stringify(result.output)}`;
      if (endedTools.has(identity)) {
        continue;
      }

      endedTools.add(identity);
      yield result.id
        ? {
            type: "tool_end",
            id: result.id,
            name: result.name,
            output: result.output,
          }
        : {
            type: "tool_end",
            name: result.name,
            output: result.output,
          };
    }

    for (const debugEvent of createDebugEvent(options.debug, "Stream chunk", { mode })) {
      yield debugEvent;
    }
  }

  yield {
    type: "done",
    finishReason: "stop",
  };

  options.logger.debug("Agent stream completed", {
    threadId: options.threadId,
  });
}
