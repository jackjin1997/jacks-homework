/**
 * Tool evaluator — expected_tool 必须出现在 toolCalls 里。
 *
 * 用于 expected_action="act_resolve_or_escalate" 太粗、需要锁定具体工具的场景。
 * 例：access manager_approval 路径必须调 request_access_approval（act step 内 HITL），
 *     不能调 auto_grant_access（绕过审批）。
 */

import type { Evaluator } from "./types";

export const toolEvaluator: Evaluator = {
  key: "tool",
  applies: (s) => Boolean(s.expected_tool),
  evaluate: (run, s) => {
    const expected = s.expected_tool!;
    const called = run.toolCalls.some((c) => c.name === expected);
    return {
      key: "tool",
      score: called ? 1 : 0,
      comment: called
        ? `${expected} called`
        : `expected ${expected}; called=[${run.toolCalls.map((c) => c.name).join(", ") || "none"}]`,
    };
  },
};
