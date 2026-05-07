import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";

export const advanceToStepTool = tool(
  async ({ next_step, scenario, related }) =>
    new Command({
      update: {
        currentStep: next_step,
        ...(scenario ? { scenario } : {}),
        ...(related && related.length ? { related } : {}),
      },
    }),
  {
    name: "advance_to_step",
    description:
      "Advance the workflow to the next step. Call this at the end of triage/diagnose/decide. NOT available in escalate_prep (terminal state).",
    schema: z.object({
      next_step: z.enum(["diagnose", "decide", "act"]),
      scenario: z
        .string()
        .optional()
        .describe(
          "Required when advancing from triage. One of: password_account, vpn_network, access_request, app_slow, data_pipeline",
        ),
      related: z
        .array(z.string())
        .optional()
        .describe(
          "Set from triage when user mentions multiple related scenarios; diagnose can query them in parallel",
        ),
    }),
  },
);
