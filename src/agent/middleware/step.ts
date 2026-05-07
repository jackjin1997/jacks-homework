import { createMiddleware } from "langchain";
import { loadStepPrompt } from "../playbook";
import {
  HelpdeskStateSchema,
  type Step,
  type HelpdeskState,
} from "@/contracts/helpdesk_state";

type StepConfig = {
  toolNames: string[];
  requires: (keyof HelpdeskState)[];
};

export const STEP_CONFIG: Record<Step, StepConfig> = {
  triage: { toolNames: ["get_user"], requires: [] },
  diagnose: {
    toolNames: ["search_kb", "get_system_status", "check_policy"],
    requires: ["scenario"],
  },
  decide: { toolNames: [], requires: ["scenario"] },
  // v1.6: 拆 grant_access → auto_grant_access (HITL off) + request_access_approval (HITL on)
  act: {
    toolNames: [
      "create_ticket",
      "escalate",
      "auto_grant_access",
      "request_access_approval",
    ],
    requires: ["scenario", "userId"],
  },
  // v1.6: escalate_prep 暴露 escalate_user_requested (HITL off, 用户主动专属)
  escalate_prep: { toolNames: ["escalate_user_requested"], requires: ["userId"] },
  // saga sentinel — never invokes the LLM (wrapModelCall throws below).
  escalate_committing: { toolNames: [], requires: [] },
};

export const stepMiddleware = createMiddleware({
  name: "StepMiddleware",
  stateSchema: HelpdeskStateSchema,
  wrapModelCall: async (request, next) => {
    const step = ((request.state as HelpdeskState).currentStep ?? "triage") as Step;

    // Caller (chat self-heal / escalate Step 1 recovery) must transition out of the sentinel
    // before the LLM is invoked. Reaching this branch means a route bypassed the guard.
    if (step === "escalate_committing") {
      throw new Error(
        `[stepMiddleware] state stuck in 'escalate_committing' (saga mid-flight). ` +
          `Caller must complete /api/escalate or trigger /api/chat self-heal before LLM invocation.`,
      );
    }

    const cfg = STEP_CONFIG[step];

    // requires check
    const state = request.state as HelpdeskState;
    const missing = cfg.requires.filter((k) => state[k] == null);
    if (missing.length > 0) {
      throw new Error(
        `[stepMiddleware] step "${step}" requires state fields [${missing.join(", ")}]; ` +
          `did the previous step forget to advance with proper state update?`,
      );
    }

    // v1.6: escalate_prep 是终态，不暴露 advance_to_step
    const allowedNames = new Set<string>(cfg.toolNames);
    if (step !== "escalate_prep") {
      allowedNames.add("advance_to_step");
    }

    return next({
      ...request,
      systemPrompt: loadStepPrompt(step),
      tools: (request.tools ?? []).filter((t) => allowedNames.has((t as { name: string }).name)),
    });
  },
});

// re-export for convenience
export { STEPS } from "@/contracts/helpdesk_state";
export type { Step, HelpdeskState } from "@/contracts/helpdesk_state";
