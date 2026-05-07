/**
 * Scenario evaluator — finalState.scenario === expected_scenario（精确匹配）。
 */

import type { Evaluator } from "./types";

export const scenarioEvaluator: Evaluator = {
  key: "scenario",
  applies: (s) => Boolean(s.expected_scenario),
  evaluate: (run, s) => {
    const actual = run.finalState.scenario ?? null;
    const pass = actual === s.expected_scenario;
    return {
      key: "scenario",
      score: pass ? 1 : 0,
      comment: pass
        ? `scenario=${actual}`
        : `expected=${s.expected_scenario} actual=${actual}`,
    };
  },
};
