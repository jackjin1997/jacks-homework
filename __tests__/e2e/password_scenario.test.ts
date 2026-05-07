import "dotenv/config";
import { describe, it, expect } from "vitest";
import { Command } from "@langchain/langgraph";
import { buildAgent, _resetAgentSingleton } from "@/agent";

describe.runIf(process.env.RUN_LLM_TESTS === "1" && !!process.env.GOOGLE_API_KEY)("password scenario e2e", () => {
  it("triage → diagnose → decide → act with okta KB citation", async () => {
    _resetAgentSingleton();
    const agent = buildAgent(() => "u-001");
    const config = { configurable: { thread_id: `u-001:pwd-${Date.now()}` }, recursionLimit: 25 };

    // Inject userId + lastUserMessage (chat route 在生产做这一步)
    await (agent as any).updateState(config, { userId: "u-001", lastUserMessage: "我登不上 Okta，重置密码也是 401" });

    let result: any = await agent.invoke(
      { messages: [{ role: "user", content: "我是 u-001。我登不上 Okta，重置了密码也是 401。" }] },
      config,
    );

    // 如果 agent 走到 act step 调 escalate / create_ticket（HITL on）→ interrupt，需要 approve resume
    let resumes = 0;
    while (result.__interrupt__ && resumes++ < 3) {
      result = await agent.invoke(new Command({ resume: { decisions: [{ type: "approve" }] } }), config);
    }

    // 把所有 message content 拼起来检查（KB 引用可能在中间 tool message 而非 last assistant message）
    const allText = result.messages.map((m: any) => String(m.content ?? "")).join("\n");
    expect(allText).toMatch(/okta_session_corruption/);

    // 最终 state 应 ≥ act
    const finalStep = result.currentStep;
    expect(["act", "escalate_prep"]).toContain(finalStep);
  }, 120_000);
});
