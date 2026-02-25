import { describe, expect, it } from "vitest";

import { loadAppConfig } from "../src/config/env.js";

describe("loadAppConfig", () => {
  it("loads required OpenAI-compatible fields", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://example.com/v1";
    process.env.OPENAI_MODEL = "my-model";
    process.env.DEBUG = "true";
    process.env.PORT = "4321";

    const config = loadAppConfig();

    expect(config.openai.apiKey).toBe("test-key");
    expect(config.openai.baseUrl).toBe("https://example.com/v1");
    expect(config.openai.model).toBe("my-model");
    expect(config.debug).toBe(true);
    expect(config.port).toBe(4321);
  });
});
