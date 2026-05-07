/**
 * Related evaluator — expected_related ⊆ finalState.related（次级场景子集匹配）。
 *
 * 用子集而不是相等：spec §5 留余地 agent 可以识别更多次级场景，只要必须的次级
 * 场景被覆盖即可。如果未来 spec 改成"必须精确等于"，把 isSubset 换成 setEq 即可。
 */

import type { Evaluator } from "./types";

export const relatedEvaluator: Evaluator = {
  key: "related",
  applies: (s) => Array.isArray(s.expected_related) && s.expected_related.length > 0,
  evaluate: (run, s) => {
    const actual = run.finalState.related ?? [];
    const expected = s.expected_related ?? [];
    const missing = expected.filter((r) => !actual.includes(r));
    const pass = missing.length === 0;
    return {
      key: "related",
      score: pass ? 1 : 0,
      comment: pass
        ? `related=[${actual.join(", ")}]`
        : `missing [${missing.join(", ")}], actual=[${actual.join(", ")}]`,
    };
  },
};
