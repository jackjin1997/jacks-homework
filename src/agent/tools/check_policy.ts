import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { evaluateAccessPolicy } from "@/lib/access_policy";

/** factory 注入 userId */
export const makeCheckPolicyTool = (getUserId: () => string) => tool(
  async ({ action }, config) => {
    const userId = getUserId();
    const result = evaluateAccessPolicy(userId, action);
    const summary = JSON.stringify(result);

    return new Command({
      update: {
        evidenceCollected: [{
          source: "data/policies.yaml",
          excerpt: `action=${action}, decision=${result.decision}, risk=${result.risk}, reason=${result.reason}`,
          timestamp: new Date().toISOString(),
          tool: "check_policy",
        }],
        messages: [{ role: "tool", content: summary, tool_call_id: config?.toolCall?.id ?? "check_policy" }],
      },
    });
  },
  {
    name: "check_policy",
    description: "Check if an access action is allowed. Returns { decision: 'auto_approve_low_risk' | 'manager_approval' | 'deny', risk: 'low' | 'medium' | 'high', ... }. user_id is bound server-side; do NOT pass user_id as an argument. Use risk to decide auto_grant_access (low) vs request_access_approval (medium/high).",
    schema: z.object({
      action: z.string().describe("e.g. grant_snowflake_prod_readonly"),
    }),
  },
);
