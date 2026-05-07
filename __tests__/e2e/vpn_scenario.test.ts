import "dotenv/config";
import { describe, it, expect } from "vitest";
import { Command } from "@langchain/langgraph";
import { buildAgent, _resetAgentSingleton } from "@/agent";

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY)("VPN scenario e2e (with active incident)", () => {
  it("references active incident or VPN gateway in response", async () => {
    _resetAgentSingleton();
    const userId = "u-002";   // u-002 (Bob) 是 sales 团队，触发 vpn 场景
    const agent = buildAgent(() => userId);
    const config = { configurable: { thread_id: `${userId}:vpn-${Date.now()}` }, recursionLimit: 25 };

    await (agent as any).updateState(config, {
      userId,
      lastUserMessage: "我是 u-002，VPN 每 10 分钟就断一次，无法访问内网。",
    });

    const r1: any = await agent.invoke(
      { messages: [{ role: "user", content: "我是 u-002，VPN 每 10 分钟就断一次，无法访问内网。" }] },
      config,
    );

    // 可能触发 HITL（escalate active_incident），也可能直接给步骤
    let finalText: string;
    if (r1.__interrupt__) {
      const r2: any = await agent.invoke(
        new Command({ resume: { decisions: [{ type: "approve" }] } }),
        config,
      );
      finalText = r2.messages.map((m: any) => String(m.content ?? "")).join("\n");
    } else {
      finalText = r1.messages.map((m: any) => String(m.content ?? "")).join("\n");
    }

    // 验证：应当引用 active incident ID 或至少提到 vpn_gateway / gateway
    expect(finalText).toMatch(/INC-2026-05-03-001|vpn_gateway|gateway|incident/i);
  }, 120_000);
});
