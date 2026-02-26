import { describe, expect, it } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { streamAgentEvents, toSseFrame, type AgentInvoker } from "../src/streams/agent-stream.js";

class FakeAgent implements AgentInvoker {
  async *stream(): AsyncGenerator<unknown> {
    yield ["messages", [{ content: [{ text: "Hello" }] }, { node: "agent" }]];
    yield [
      "updates",
      {
        node: {
          messages: [
            {
              tool_calls: [{ id: "tool-1", name: "search", args: { q: "langchain" } }],
            },
          ],
        },
      },
    ];
    yield [
      "updates",
      {
        node: {
          messages: [
            {
              type: "tool",
              tool_call_id: "tool-1",
              name: "search",
              content: "done",
            },
          ],
        },
      },
    ];
  }
}

class CaptureInputAgent implements AgentInvoker {
  lastInput: unknown;

  async *stream(input: unknown): AsyncGenerator<unknown> {
    this.lastInput = input;
    yield ["messages", [{ content: [{ text: "ok" }] }, { node: "agent" }]];
  }
}

class ToolMessageLeakAgent implements AgentInvoker {
  async *stream(): AsyncGenerator<unknown> {
    yield [
      "messages",
      [
        {
          type: "tool",
          role: "tool",
          tool_call_id: "tool-1",
          content: [{ text: "     1\t# Skill Header" }],
        },
        { langgraph_node: "tools" },
      ],
    ];
    yield [
      "messages",
      [
        {
          type: "AIMessageChunk",
          role: "assistant",
          content: [{ text: "final answer" }],
        },
        { langgraph_node: "agent" },
      ],
    ];
  }
}

describe("streamAgentEvents", () => {
  it("emits token/tool/done events", async () => {
    const events = [];

    for await (const event of streamAgentEvents({
      agent: new FakeAgent(),
      input: "test",
      threadId: "t-1",
      debug: false,
      logger: createLogger(false),
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "token", text: "Hello" });
    expect(events.find((event) => event.type === "tool_start")).toBeDefined();
    expect(events.find((event) => event.type === "tool_end")).toBeDefined();
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "stop" });
  });

  it("formats SSE frames", () => {
    const frame = toSseFrame({
      type: "token",
      text: "A",
    });

    expect(frame).toContain("event: token");
    expect(frame).toContain("data: {");
  });

  it("passes virtual files into agent input when provided", async () => {
    const agent = new CaptureInputAgent();
    const files = {
      "/skills/example/SKILL.md": {
        content: ["# Example"],
        created_at: "2026-02-25T00:00:00.000Z",
        modified_at: "2026-02-25T00:00:00.000Z",
      },
    };

    for await (const _event of streamAgentEvents({
      agent,
      input: "test",
      threadId: "t-1",
      files,
      debug: false,
      logger: createLogger(false),
    })) {
    }

    expect(agent.lastInput).toEqual({
      messages: [{ role: "user", content: "test" }],
      files,
    });
  });

  it("does not emit tool message content as token output", async () => {
    const tokens: string[] = [];

    for await (const event of streamAgentEvents({
      agent: new ToolMessageLeakAgent(),
      input: "test",
      threadId: "t-1",
      debug: false,
      logger: createLogger(false),
    })) {
      if (event.type === "token") {
        tokens.push(event.text);
      }
    }

    expect(tokens).toEqual(["final answer"]);
  });
});
