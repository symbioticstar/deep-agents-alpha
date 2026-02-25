export interface AgentStreamRequest {
  input: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}

export type AgentStreamEvent =
  | {
      type: "session";
      threadId: string;
    }
  | {
      type: "token";
      text: string;
    }
  | {
      type: "tool_start";
      name: string;
      input: unknown;
      id?: string;
    }
  | {
      type: "tool_end";
      name: string;
      output: unknown;
      id?: string;
    }
  | {
      type: "debug";
      message: string;
      data?: unknown;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    }
  | {
      type: "done";
      finishReason: "stop" | "error" | "aborted";
    };
