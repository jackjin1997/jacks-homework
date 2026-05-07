import "dotenv/config";
import { describe, it, expect } from "vitest";
import { buildAgent } from "@/agent";

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY)("agent smoke", () => {
  it("answers a trivial prompt", async () => {
    const agent = buildAgent(() => "smoke-user");
    const result = await agent.invoke(
      { messages: [{ role: "user", content: "Say hi in 3 words." }] },
      { configurable: { thread_id: "smoke-1" } },
    );
    const last = result.messages[result.messages.length - 1];
    expect(typeof last.content).toBe("string");
    expect(String(last.content).length).toBeGreaterThan(0);
  }, 30_000);
});
