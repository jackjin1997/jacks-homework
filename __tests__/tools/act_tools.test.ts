import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN, DATA_DIR } from "@/lib/paths";
import { createTicketTool } from "@/agent/tools/create_ticket";
import { escalateTool } from "@/agent/tools/escalate";
import { escalateUserRequestedTool } from "@/agent/tools/escalate_user_requested";
import { makeAutoGrantAccessTool } from "@/agent/tools/auto_grant_access";
import { makeRequestAccessApprovalTool } from "@/agent/tools/request_access_approval";

const validPacket = {
  user_question: "vpn drops",
  evidence_collected: [{ source: "data/kb/network/vpn_gateway_incident.md", excerpt: "...", timestamp: "2026-05-04T10:00:00Z", tool: "search_kb" }],
  steps_attempted: [],
  why_escalating: "active_incident" as const,
  suggested_next_action: "give ETA",
  confidence: "high" as const,
};

const fixedUser = () => "u-001";

beforeEach(() => fs.mkdirSync(TICKETS_OPEN, { recursive: true }));
afterEach(() => {
  for (const f of fs.readdirSync(TICKETS_OPEN)) {
    if (f.startsWith("T-")) fs.unlinkSync(path.join(TICKETS_OPEN, f));
  }
});

describe("act tools (v1.6 拆 4 工具 + factory)", () => {
  it("create_ticket writes escalated:false", async () => {
    const out = JSON.parse(await createTicketTool.invoke(validPacket));
    const written = JSON.parse(fs.readFileSync(path.join(process.cwd(), out.file), "utf-8"));
    expect(written.escalated).toBe(false);
  });

  it("escalate writes escalated:true", async () => {
    const out = JSON.parse(await escalateTool.invoke(validPacket));
    const written = JSON.parse(fs.readFileSync(path.join(process.cwd(), out.file), "utf-8"));
    expect(written.escalated).toBe(true);
    expect(written.packet.why_escalating).toBe("active_incident");
  });

  it("escalate rejects empty user_question (zod)", async () => {
    await expect(escalateTool.invoke({ ...validPacket, user_question: "" })).rejects.toThrow();
  });

  it("escalate_user_requested forces why_escalating='user_requested' + user_requested:true tag", async () => {
    const out = JSON.parse(await escalateUserRequestedTool.invoke({ ...validPacket, why_escalating: "no_kb_match" }));   // 即使传错也强制
    const written = JSON.parse(fs.readFileSync(path.join(process.cwd(), out.file), "utf-8"));
    expect(written.packet.why_escalating).toBe("user_requested");
    expect(written.user_requested).toBe(true);
  });

  it("auto_grant_access (factory) adds only policy-approved low-risk group, no user_id in schema", async () => {
    const t = makeAutoGrantAccessTool(fixedUser);
    const schema = (t as any).schema?._def?.shape ?? (t as any).schema?.shape;
    const fields = typeof schema === "function" ? schema() : schema;
    expect(fields && Object.keys(fields)).not.toContain("user_id");
    const out = JSON.parse(await t.invoke({ group: "snowflake-prod-readonly" }));
    expect(out.ok).toBe(true);
    expect(out.user_id).toBe("u-001");
    expect(out.auto_approved).toBe(true);
    // cleanup
    const file = path.join(DATA_DIR, "users.json");
    const users = JSON.parse(fs.readFileSync(file, "utf-8"));
    users["u-001"].groups = users["u-001"].groups.filter((g: string) => g !== "snowflake-prod-readonly");
    fs.writeFileSync(file, JSON.stringify(users, null, 2));
  });

  it("auto_grant_access refuses high-risk or unknown groups even if the LLM calls it directly", async () => {
    const t = makeAutoGrantAccessTool(fixedUser);
    const out = JSON.parse(await t.invoke({ group: "snowflake-prod-admin" }));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("policy_not_auto_approved");
    expect(out.decision).toBe("manager_approval");
    expect(out.risk).toBe("high");
  });

  it("auto_grant_access serializes concurrent writes to users.json", async () => {
    const t = makeAutoGrantAccessTool(fixedUser);
    await Promise.all([
      t.invoke({ group: "snowflake-prod-readonly" }),
      t.invoke({ group: "snowflake-prod-readonly" }),
    ]);

    const file = path.join(DATA_DIR, "users.json");
    const users = JSON.parse(fs.readFileSync(file, "utf-8"));
    const grants = users["u-001"].groups.filter((g: string) => g === "snowflake-prod-readonly");
    expect(grants).toHaveLength(1);
    users["u-001"].groups = users["u-001"].groups.filter((g: string) => g !== "snowflake-prod-readonly");
    fs.writeFileSync(file, JSON.stringify(users, null, 2));
  });

  it("auto_grant_access denies unknown user", async () => {
    const t = makeAutoGrantAccessTool(() => "ghost");
    const out = JSON.parse(await t.invoke({ group: "x" }));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("user_not_found");
  });

  it("request_access_approval writes ticket with manager email", async () => {
    const t = makeRequestAccessApprovalTool(fixedUser);
    const out = JSON.parse(await t.invoke({ group: "snowflake-prod-admin", justification: "needed for ML pipeline" }));
    expect(out.ticket_id).toMatch(/^T-/);
    expect(out.manager_email).toBeTruthy();
    const written = JSON.parse(fs.readFileSync(path.join(process.cwd(), out.file), "utf-8"));
    expect(written.type).toBe("access_request");
    expect(written.justification).toContain("ML pipeline");
    expect(written.manager).toBeTruthy();
  });

  it("request_access_approval schema requires justification", async () => {
    const t = makeRequestAccessApprovalTool(fixedUser);
    await expect(t.invoke({ group: "x", justification: "" })).rejects.toThrow();
  });
});
