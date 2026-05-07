import { tool } from "@langchain/core/tools";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN } from "@/lib/paths";
import { HandoffPacket } from "@/contracts/handoff_packet";

export const escalateTool = tool(
  async (input) => {
    const packet = HandoffPacket.parse(input);
    const id = `T-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const file = path.join(TICKETS_OPEN, `${id}.json`);
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ id, packet, escalated: true, created_at: new Date().toISOString() }, null, 2));
    return JSON.stringify({ ticket_id: id, file: path.relative(process.cwd(), file), escalated: true });
  },
  {
    name: "escalate",
    description: "Agent-initiated escalation to a human IT engineer. HITL-protected. Use when KB has no match (no_kb_match), incident is active (active_incident), shallow scenario (out_of_scope), or manager approval required (manager_approval_required). Argument is a complete HandoffPacket. Note: user-initiated escalations go through the 🔴 button → escalate_user_requested, never call escalate with why_escalating='user_requested' here.",
    schema: HandoffPacket,
  },
);
