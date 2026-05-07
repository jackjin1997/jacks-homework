import { describe, it, expect } from "vitest";
import { STEP_CONFIG } from "@/agent/middleware/step";

describe("STEP_CONFIG isolation", () => {
  // v1.6: grant_access 已拆为 auto_grant_access + request_access_approval
  it("auto_grant_access / request_access_approval never available in triage", () => {
    expect(STEP_CONFIG.triage.toolNames).not.toContain("auto_grant_access");
    expect(STEP_CONFIG.triage.toolNames).not.toContain("request_access_approval");
  });

  it("act has no read tools", () => {
    expect(STEP_CONFIG.act.toolNames).not.toContain("search_kb");
    expect(STEP_CONFIG.act.toolNames).not.toContain("get_system_status");
  });

  it("act has 4 write tools (v1.6 拆分)", () => {
    expect(STEP_CONFIG.act.toolNames).toEqual(
      expect.arrayContaining([
        "create_ticket",
        "escalate",
        "auto_grant_access",
        "request_access_approval",
      ]),
    );
    expect(STEP_CONFIG.act.toolNames).toHaveLength(4);
  });

  it("escalate_prep exposes only escalate_user_requested (v1.6 拆分)", () => {
    expect(STEP_CONFIG.escalate_prep.toolNames).toEqual(["escalate_user_requested"]);
  });

  it("decide has zero tools (forces pure reasoning)", () => {
    expect(STEP_CONFIG.decide.toolNames).toEqual([]);
  });

  it("diagnose/decide/act all require scenario", () => {
    for (const s of ["diagnose", "decide", "act"] as const) {
      expect(STEP_CONFIG[s].requires).toContain("scenario");
    }
  });

  it("act/escalate_prep require userId (v1.6 同步)", () => {
    expect(STEP_CONFIG.act.requires).toContain("userId");
    expect(STEP_CONFIG.escalate_prep.requires).toContain("userId");
  });

  it("triage has no requires (entry point)", () => {
    expect(STEP_CONFIG.triage.requires).toEqual([]);
  });
});
