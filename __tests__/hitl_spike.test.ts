import "dotenv/config";
import { describe, it, expect } from "vitest";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import { MemorySaver, Command } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const dangerous = tool(async ({ to }: { to: string }) => `sent to ${to}`, {
  name: "dangerous",
  description: "do dangerous thing",
  schema: z.object({ to: z.string() }),
});

function buildSpikeAgent(decisions: Array<"approve" | "edit" | "reject">) {
  return createAgent({
    model: process.env.LLM_MODEL ?? "google-genai:gemini-2.5-pro",
    tools: [dangerous],
    checkpointer: new MemorySaver(),
    middleware: [
      humanInTheLoopMiddleware({
        interruptOn: { dangerous: { allowedDecisions: decisions } },
      }),
    ],
  });
}

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY && process.env.RUN_SPIKES === "1")("HITL spike — API signature", () => {
  it("interrupts before dangerous tool, resumes on approve", async () => {
    const agent = buildSpikeAgent(["approve", "reject"]);
    const cfg = { configurable: { thread_id: `spike-approve-${Date.now()}` } };
    const r1: any = await agent.invoke(
      { messages: [{ role: "user", content: "use dangerous tool with to=foo" }] },
      cfg,
    );
    expect(r1.__interrupt__).toBeTruthy();

    const r2: any = await agent.invoke(
      new Command({ resume: { decisions: [{ type: "approve" }] } }),
      cfg,
    );
    const last = r2.messages[r2.messages.length - 1];
    expect(String(last.content).toLowerCase()).toContain("foo");
  }, 60_000);

  it("reject path returns rejection feedback", async () => {
    const agent = buildSpikeAgent(["approve", "reject"]);
    const cfg = { configurable: { thread_id: `spike-reject-${Date.now()}` } };
    await agent.invoke(
      { messages: [{ role: "user", content: "use dangerous tool with to=bar" }] },
      cfg,
    );
    const r2: any = await agent.invoke(
      new Command({ resume: { decisions: [{ type: "reject", message: "no, please don't" }] } }),
      cfg,
    );
    expect(r2.messages.length).toBeGreaterThan(0);
  }, 60_000);
});

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY && process.env.RUN_SPIKES === "1")("HITL spike — edit 验收门槛 (v1.6 P1-11)", () => {
  it("connects 5 edit decisions; reports success rate (3+ passes ⇒ enable edit in Task 15)", async () => {
    const agent = buildSpikeAgent(["approve", "edit", "reject"]);
    let success = 0;
    for (let i = 0; i < 5; i++) {
      const cfg = { configurable: { thread_id: `spike-edit-${i}-${Date.now()}` } };
      try {
        await agent.invoke(
          { messages: [{ role: "user", content: `use dangerous tool with to=user${i}` }] },
          cfg,
        );
        const r2: any = await agent.invoke(
          new Command({
            resume: {
              decisions: [
                {
                  type: "edit",
                  // NOTE: API uses editedAction (camelCase), not edited_action
                  editedAction: { name: "dangerous", args: { to: `edited-${i}` } },
                },
              ],
            },
          }),
          cfg,
        );
        const last = r2.messages[r2.messages.length - 1];
        if (String(last.content).includes(`edited-${i}`)) success++;
      } catch (_e) {
        // edit path may throw — count as failure
      }
    }
    console.log(`[hitl-spike] edit success rate: ${success}/5`);
    // verdict: 3+ ⇒ Task 15 改回 ["approve","edit","reject"]；否则锁 ["approve","reject"]
    // 不强制 expect — spike 是探测性，结果写日志供决策
    expect(success).toBeGreaterThanOrEqual(0); // sanity
  }, 240_000);
});
