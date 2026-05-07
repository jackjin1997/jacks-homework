import { describe, it, expect } from "vitest";
import { HandoffPacket } from "@/contracts/handoff_packet";

const validPacket = {
  user_question: "VPN keeps dropping",
  evidence_collected: [
    { source: "data/kb/network/vpn_drop.md", excerpt: "...", timestamp: "2026-05-04T10:00:00Z", tool: "search_kb" },
  ],
  steps_attempted: ["restart vpn client"],
  why_escalating: "active_incident" as const,
  suggested_next_action: "Check ETA on incident #INC-42",
  confidence: "high" as const,
};

describe("HandoffPacket", () => {
  it("accepts a complete packet", () => {
    expect(() => HandoffPacket.parse(validPacket)).not.toThrow();
  });
  it("rejects empty user_question", () => {
    expect(() => HandoffPacket.parse({ ...validPacket, user_question: "" })).toThrow();
  });
  it("rejects unknown why_escalating", () => {
    expect(() => HandoffPacket.parse({ ...validPacket, why_escalating: "bogus" })).toThrow();
  });
  it("rejects agent_detected_user_change_of_mind (v1.8 — removed, ambiguity handled via clarifying question)", () => {
    const p = { ...validPacket, why_escalating: "agent_detected_user_change_of_mind" };
    expect(() => HandoffPacket.parse(p)).toThrow();
  });
  it("allows empty evidence_collected (user_requested edge case)", () => {
    const p = { ...validPacket, evidence_collected: [], why_escalating: "user_requested" as const };
    expect(() => HandoffPacket.parse(p)).not.toThrow();
  });
  it("rejects > 10 evidence entries (v1.3.1 P1-4 max constraint)", () => {
    const p = { ...validPacket, evidence_collected: Array(11).fill(validPacket.evidence_collected[0]) };
    expect(() => HandoffPacket.parse(p)).toThrow();
  });
  it("rejects fake source path (v1.3.1 P2-9 anchored regex)", () => {
    const p = { ...validPacket, evidence_collected: [{ ...validPacket.evidence_collected[0], source: "data/kb_fake/x.md" }] };
    expect(() => HandoffPacket.parse(p)).toThrow();
  });
});
