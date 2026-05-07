import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const dangerous = tool(async ({ to }: { to: string }) => `sent to ${to}`, {
  name: "dangerous",
  description: "do dangerous thing",
  schema: z.object({ to: z.string() }),
});

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY && process.env.RUN_SPIKES === "1")("HITL stream + interrupt 验收门槛 (R1-STREAM)", () => {
  it("agent.stream emits __interrupt__ chunk before dangerous tool runs", async () => {
    const agent = createAgent({
      model: process.env.LLM_MODEL ?? "google-genai:gemini-2.5-pro",
      tools: [dangerous],
      checkpointer: new MemorySaver(),
      middleware: [
        humanInTheLoopMiddleware({
          interruptOn: { dangerous: { allowedDecisions: ["approve", "reject"] } },
        }),
      ],
    });

    const cfg = {
      configurable: { thread_id: `stream-spike-${Date.now()}` },
      streamMode: ["updates", "messages"] as any,
    };

    let interruptSeen = false;
    let chunkCount = 0;
    const stream = await agent.stream(
      { messages: [{ role: "user", content: "use dangerous tool with to=baz" }] },
      cfg,
    );
    for await (const chunk of stream as AsyncIterable<unknown>) {
      chunkCount++;
      // chunk shape varies by streamMode — check for __interrupt__ in any nested form
      const flat = JSON.stringify(chunk);
      if (flat.includes("__interrupt__")) {
        interruptSeen = true;
      }
      if (chunkCount > 50) break; // safety
    }
    console.log(`[stream-spike] chunks=${chunkCount}, interruptSeen=${interruptSeen}`);
    expect(interruptSeen).toBe(true);
  }, 60_000);
});
