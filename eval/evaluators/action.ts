/**
 * Action evaluator — expected_action ∈ {escalate, act_resolve_or_escalate}
 *
 * 映射：
 *   escalate                  → 终态有 escalate / escalate_user_requested 工具调用
 *   act_resolve_or_escalate   → final_step === "act"（无论 self-serve 还是 act 内 escalate
 *                                都视作"按 spec 走到 act 即可"）
 *
 * 这个映射来自 spec §3 + AGENTS.md 的 STEPS 序列。如果 yaml 后续引入新 expected_action
 * 值（比如 "ask_clarifying_question"），这里会自动 fail 并提示新值未识别。
 */

import type { Evaluator } from "./types";

const ESCALATE_TOOL_NAMES = new Set(["escalate", "escalate_user_requested"]);

export const actionEvaluator: Evaluator = {
  key: "action",
  applies: (s) => Boolean(s.expected_action),
  evaluate: (run, s) => {
    const expected = s.expected_action;
    const escalated = run.toolCalls.some((c) => ESCALATE_TOOL_NAMES.has(c.name));
    const finalStep = run.finalState.currentStep ?? "(unset)";

    if (expected === "escalate") {
      const pass = escalated;
      return {
        key: "action",
        score: pass ? 1 : 0,
        comment: pass
          ? `escalated via ${run.toolCalls.find((c) => ESCALATE_TOOL_NAMES.has(c.name))?.name}`
          : `expected escalate; no escalate tool called; final_step=${finalStep}`,
      };
    }

    if (expected === "act_resolve_or_escalate") {
      const pass = finalStep === "act" || finalStep === "escalate_prep";
      return {
        key: "action",
        score: pass ? 1 : 0,
        comment: pass
          ? `final_step=${finalStep}${escalated ? " (escalated)" : ""}`
          : `expected act/escalate_prep; final_step=${finalStep}`,
      };
    }

    return {
      key: "action",
      score: 0,
      comment: `unrecognized expected_action="${expected}" — update action.ts mapping`,
    };
  },
};
