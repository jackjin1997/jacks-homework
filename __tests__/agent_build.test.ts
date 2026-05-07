import { describe, it, expect } from "vitest";
import { hitlConfig } from "@/agent";

describe("hitlConfig", () => {
  it("contains escalate / create_ticket / request_access_approval (HITL on)", () => {
    const keys = Object.keys(hitlConfig.interruptOn).sort();
    expect(keys).toEqual(["create_ticket", "escalate", "request_access_approval"]);
  });

  it("does NOT contain escalate_user_requested (HITL off, user-initiated)", () => {
    expect(Object.keys(hitlConfig.interruptOn)).not.toContain("escalate_user_requested");
  });

  it("does NOT contain auto_grant_access (HITL off, low-risk)", () => {
    expect(Object.keys(hitlConfig.interruptOn)).not.toContain("auto_grant_access");
  });

  it("all interruptOn entries lock to approve/reject (v1 default; edit deferred)", () => {
    for (const cfg of Object.values(hitlConfig.interruptOn)) {
      expect((cfg as any).allowedDecisions).toEqual(["approve", "reject"]);
    }
  });
});
