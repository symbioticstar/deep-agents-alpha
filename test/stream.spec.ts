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
});
