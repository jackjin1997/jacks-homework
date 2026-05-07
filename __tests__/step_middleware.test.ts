import { describe, it, expect } from "vitest";
import { stepMiddleware } from "@/agent/middleware/step";

// 8 字段完整 state fixture（不靠 zod default，显式列出）
const baseState = {
  currentStep: "triage" as const,
  scenario: null,
  related: [],
  userId: "u-001",
  evidenceCollected: [],
  backtrackCount: 0,
  editedPacket: null,
  lastUserMessage: null,
};

// wrapModelCall 是 AgentMiddleware 上的属性函数，直接调用
const wrapModelCall = stepMiddleware.wrapModelCall as NonNullable<
  typeof stepMiddleware.wrapModelCall
>;

describe("stepMiddleware runtime behavior", () => {
  it("filters tools to current step's allowed set", async () => {
    const fakeTools = [
      { name: "get_user" },
      { name: "search_kb" },
      { name: "escalate" },
      { name: "advance_to_step" },
    ];
    let captured: any;
    await wrapModelCall(
      { state: { ...baseState, currentStep: "triage" }, tools: fakeTools } as any,
      async (req: any) => {
        captured = req;
        return { content: "" } as any;
      },
    );
    const toolNames = captured.tools.map((t: any) => t.name).sort();
    expect(toolNames).toEqual(["advance_to_step", "get_user"]);
  });

  it("escalate_prep does NOT expose advance_to_step (terminal state)", async () => {
    const fakeTools = [
      { name: "escalate_user_requested" },
      { name: "advance_to_step" },
      { name: "search_kb" },
    ];
    let captured: any;
    await wrapModelCall(
      {
        state: {
          ...baseState,
          currentStep: "escalate_prep",
          userId: "u-001",
        },
        tools: fakeTools,
      } as any,
      async (req: any) => {
        captured = req;
        return { content: "" } as any;
      },
    );
    expect(captured.tools.map((t: any) => t.name)).toEqual(["escalate_user_requested"]);
  });

  it("throws when diagnose enters with scenario:null", async () => {
    await expect(
      wrapModelCall(
        {
          state: { ...baseState, currentStep: "diagnose", scenario: null },
          tools: [],
        } as any,
        async () => ({ content: "" } as any),
      ),
    ).rejects.toThrow(/scenario/);
  });

  it("throws when act enters with userId:null", async () => {
    await expect(
      wrapModelCall(
        {
          state: {
            ...baseState,
            currentStep: "act",
            scenario: "vpn_network",
            userId: null,
          },
          tools: [],
        } as any,
        async () => ({ content: "" } as any),
      ),
    ).rejects.toThrow(/userId/);
  });

  it("throws when escalate_prep enters with userId:null", async () => {
    await expect(
      wrapModelCall(
        {
          state: { ...baseState, currentStep: "escalate_prep", userId: null },
          tools: [],
        } as any,
        async () => ({ content: "" } as any),
      ),
    ).rejects.toThrow(/userId/);
  });

  it("injects systemPrompt derived from step", async () => {
    let captured: any;
    await wrapModelCall(
      { state: { ...baseState, currentStep: "triage" }, tools: [] } as any,
      async (req: any) => {
        captured = req;
        return { content: "" } as any;
      },
    );
    expect(typeof captured.systemPrompt).toBe("string");
    expect(captured.systemPrompt.length).toBeGreaterThan(0);
  });
});
