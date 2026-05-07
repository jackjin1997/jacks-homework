import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/paths";

/** factory 注入 userId，schema 不暴露 user_id 参数 */
export const makeGetUserTool = (getUserId: () => string) => tool(
  async (_input, config) => {
    const userId = getUserId();
    const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf-8"));
    const u = users[userId];
    const summary = u
      ? JSON.stringify({ found: true, user: u })
      : JSON.stringify({ found: false, user_id: userId });

    const newEvidence = u ? [{
      source: "data/users.json",
      excerpt: `user ${userId}: team=${u.team}, groups=${(u.groups || []).join(",")}`,
      timestamp: new Date().toISOString(),
      tool: "get_user",
    }] : [];

    return new Command({
      update: {
        evidenceCollected: newEvidence.length > 0 ? newEvidence : undefined,
        messages: [{ role: "tool", content: summary, tool_call_id: config?.toolCall?.id ?? "get_user" }],
      },
    });
  },
  {
    name: "get_user",
    description: "Get the requesting user's profile (team, manager, device, groups, location). user_id is bound server-side at agent build time; do NOT pass user_id as an argument.",
    schema: z.object({}),  // 不暴露 user_id 参数
  },
);
