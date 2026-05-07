import { describe, it, expect } from "vitest";
import { HelpdeskStateSchema, STEPS } from "@/contracts/helpdesk_state";
import { Evidence } from "@/contracts/evidence";

describe("HelpdeskStateSchema", () => {
  it("defaults to triage with all nullable/array fields empty", () => {
    const s = HelpdeskStateSchema.parse({});
    expect(s.currentStep).toBe("triage");
    expect(s.scenario).toBeNull();
    expect(s.related).toEqual([]);
    expect(s.userId).toBeNull();
    expect(s.evidenceCollected).toEqual([]);
    expect(s.backtrackCount).toBe(0);
    expect(s.editedPacket).toBeNull();
    expect(s.lastUserMessage).toBeNull();
    expect(s.pendingTicketId).toBeNull();
  });
  it("rejects unknown step", () => {
    expect(() => HelpdeskStateSchema.parse({ currentStep: "unknown" })).toThrow();
  });
  it("STEPS contains 5 LLM steps + escalate_committing sentinel", () => {
    expect(STEPS).toHaveLength(6);
    expect(STEPS).toContain("escalate_committing");
    for (const s of ["triage", "diagnose", "decide", "act", "escalate_prep"]) {
      expect(STEPS).toContain(s);
    }
  });
});

describe("Evidence", () => {
  it("accepts data/kb/ path", () => {
    expect(() => Evidence.parse({ source: "data/kb/auth/x.md", excerpt: "...", timestamp: "2026-05-05", tool: "search_kb" })).not.toThrow();
  });
  it("rejects data/kb_fake/ prefix attack", () => {
    expect(() => Evidence.parse({ source: "data/kb_fake/x.md", excerpt: "...", timestamp: "2026-05-05", tool: "search_kb" })).toThrow();
  });
  it("rejects excerpt > 200 chars", () => {
    expect(() => Evidence.parse({ source: "data/kb/x.md", excerpt: "x".repeat(201), timestamp: "2026-05-05", tool: "search_kb" })).toThrow();
  });
});
