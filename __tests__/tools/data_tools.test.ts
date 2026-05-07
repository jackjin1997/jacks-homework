import { describe, it, expect } from "vitest";
import { Command } from "@langchain/langgraph";
import { makeSearchKbTool } from "@/agent/tools/search_kb";
import { makeGetUserTool } from "@/agent/tools/get_user";
import { makeGetSystemStatusTool } from "@/agent/tools/get_system_status";
import { makeCheckPolicyTool } from "@/agent/tools/check_policy";

const fixedUserId = () => "u-001";

describe("data tools (factory + Command 累积 evidence)", () => {
  it("search_kb returns Command with evidence + match", async () => {
    const t = makeSearchKbTool();
    const result = await t.invoke({ query: "401 after correct password" });
    expect(result).toBeInstanceOf(Command);
    const update = (result as any).update;
    expect(update.evidenceCollected[0].source).toContain("okta");
    expect(update.evidenceCollected[0].tool).toBe("search_kb");
  });

  it("get_user uses factory-injected userId", async () => {
    const t = makeGetUserTool(fixedUserId);
    const result = await t.invoke({});
    const update = (result as any).update;
    expect(update.evidenceCollected[0].source).toBe("data/users.json");
    expect(update.evidenceCollected[0].excerpt).toContain("data-engineering");
  });

  it("get_user schema does NOT expose user_id parameter", () => {
    const t = makeGetUserTool(fixedUserId);
    // Zod v4: _def.shape is plain object; Zod v3: _def.shape() is function
    const defShape = (t as any).schema?._def?.shape;
    const shape = typeof defShape === "function" ? defShape() : (defShape ?? (t as any).schema?.shape ?? {});
    expect(Object.keys(shape)).not.toContain("user_id");
  });

  it("get_system_status with vpn filter returns active incident", async () => {
    const t = makeGetSystemStatusTool();
    const result = await t.invoke({ service: "vpn_gateway_us" });
    const update = (result as any).update;
    const last = update.messages[update.messages.length - 1];
    const parsed = JSON.parse(last.content);
    expect(parsed.active_incidents.length).toBeGreaterThan(0);
  });

  it("check_policy returns { decision, risk } structure with risk field", async () => {
    const t = makeCheckPolicyTool(fixedUserId);
    const result = await t.invoke({ action: "grant_snowflake_prod_admin" });
    const update = (result as any).update;
    const last = update.messages[update.messages.length - 1];
    const parsed = JSON.parse(last.content);
    expect(parsed).toHaveProperty("decision");
    expect(parsed).toHaveProperty("risk");
    expect(["low", "medium", "high"]).toContain(parsed.risk);
    expect(parsed.decision).toBe("manager_approval"); // never rule
  });

  it("check_policy denies unknown user with high risk", async () => {
    const t = makeCheckPolicyTool(() => "ghost-user");
    const result = await t.invoke({ action: "grant_snowflake_prod_readonly" });
    const last = (result as any).update.messages[0];
    const parsed = JSON.parse(last.content);
    expect(parsed.decision).toBe("deny");
    expect(parsed.risk).toBe("high");
  });

  it("evidence accumulates across tools (returned Command updates)", async () => {
    // 这个 test 只验证单工具返回的 evidence shape；累积通过 LangGraph reducer 在真 agent loop 里发生
    const t1 = makeSearchKbTool();
    const r1 = await t1.invoke({ query: "okta" });
    const ev1 = (r1 as any).update.evidenceCollected;
    expect(ev1).toBeInstanceOf(Array);
    expect(ev1[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
