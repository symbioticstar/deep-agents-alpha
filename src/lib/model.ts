import { ChatOpenAI } from "@langchain/openai";

import type { AppConfig } from "../types/config.js";

export function createChatModel(config: AppConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.openai.model,
    apiKey: config.openai.apiKey,
    configuration: {
      baseURL: config.openai.baseUrl,
    },
    temperature: 0,
  });
}
