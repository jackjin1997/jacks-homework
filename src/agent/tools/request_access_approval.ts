import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN, DATA_DIR } from "@/lib/paths";

/**
 * Factory: 高风险或需 manager 审批的 group access。HITL on。
 * 写 ticket 含 manager 邮箱（从 user.manager 查 users.json）。
 * user_id 由 server-side 注入。
 */
export const makeRequestAccessApprovalTool = (getUserId: () => string) => tool(
  async ({ group, justification }) => {
    const userId = getUserId();
    const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf-8"));
    const u = users[userId];
    if (!u) return JSON.stringify({ ok: false, reason: "user_not_found", user_id: userId });
    const manager = u.manager ? users[u.manager] : null;
    const id = `T-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const file = path.join(TICKETS_OPEN, `${id}.json`);
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      id,
      type: "access_request",
      requester: { user_id: userId, email: u.email, team: u.team },
      group_requested: group,
      justification,
      manager: manager ? { user_id: u.manager, email: manager.email, name: manager.name } : null,
      escalated: true,
      created_at: new Date().toISOString(),
    }, null, 2));
    return JSON.stringify({ ticket_id: id, file: path.relative(process.cwd(), file), manager_email: manager?.email ?? null });
  },
  {
    name: "request_access_approval",
    description: "Request manager approval for a higher-risk group. HITL-protected. Use when check_policy returns decision='manager_approval' or risk in ('medium','high'). Writes ticket containing user's manager email. user_id is bound server-side; do NOT pass user_id.",
    schema: z.object({
      group: z.string().describe("e.g. 'snowflake-prod-admin'"),
      justification: z.string().min(1).describe("Why the user needs this access"),
    }),
  },
);
