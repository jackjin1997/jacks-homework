import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/paths";
import { actionForGroup, evaluateAccessPolicy } from "@/lib/access_policy";

const usersFileLocks = new Map<string, Promise<unknown>>();

async function withUsersFileLock<T>(file: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = usersFileLocks.get(file) ?? Promise.resolve();
  const ran = prev.then(fn, fn);
  const tail = ran.catch(() => undefined);
  usersFileLocks.set(file, tail);
  try {
    return await ran;
  } finally {
    if (usersFileLocks.get(file) === tail) {
      usersFileLocks.delete(file);
    }
  }
}

/**
 * Factory: 低风险自动批准 group access。无 HITL。
 * 工具内部重新校验 policy；prompt 要求先调 check_policy 只是 UX/可解释性，不是安全边界。
 * user_id 由 server-side 注入 — schema 不暴露 user_id。
 */
export const makeAutoGrantAccessTool = (getUserId: () => string) => tool(
  async ({ group }) => {
    const userId = getUserId();
    const action = actionForGroup(group);
    const file = path.join(DATA_DIR, "users.json");

    return withUsersFileLock(file, () => {
      const policy = evaluateAccessPolicy(userId, action);
      if (policy.reason === "user_not_found") {
        return JSON.stringify({ ok: false, reason: "user_not_found", user_id: userId });
      }
      if (policy.decision !== "auto_approve_low_risk" || policy.risk !== "low") {
        return JSON.stringify({
          ok: false,
          reason: "policy_not_auto_approved",
          user_id: userId,
          group,
          action,
          decision: policy.decision,
          risk: policy.risk,
          policy_reason: policy.reason,
        });
      }

      const users = JSON.parse(fs.readFileSync(file, "utf-8"));
      const u = users[userId];
      if (!u) return JSON.stringify({ ok: false, reason: "user_not_found", user_id: userId });
      if (!u.groups.includes(group)) {
        u.groups.push(group);
        const tmpFile = `${file}.tmp.${process.pid}.${Date.now()}`;
        try {
          fs.writeFileSync(tmpFile, JSON.stringify(users, null, 2));
          fs.renameSync(tmpFile, file);
        } catch (e) {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            // best effort cleanup
          }
          throw e;
        }
      }
      return JSON.stringify({ ok: true, user_id: userId, group, current_groups: u.groups, auto_approved: true });
    });
  },
  {
    name: "auto_grant_access",
    description: "Grant a low-risk group to the requesting user (auto-approved, no HITL). PREREQUISITE: must have called check_policy first AND received decision='auto_approve_low_risk' with risk='low'. Otherwise use request_access_approval. user_id is bound server-side; do NOT pass user_id.",
    schema: z.object({
      group: z.string().describe("e.g. 'snowflake-prod-readonly', 'grafana-readonly'"),
    }),
  },
);
