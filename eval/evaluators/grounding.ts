/**
 * Grounding evaluator
 *
 * Pass when:
 *   - 所有 must_cite_sources 都在 transcript 里出现
 *   - 没有任何 must_not_cite 在 transcript 里出现
 *   - 所有被 anchored regex 命中的路径都真实存在于磁盘
 *
 * 注意：substring match 是粗的 — agent 在反例中提到红色 KB（"不要用 X"）也会被
 * 算作 wrongly_cited。本次先保持原语义（v1.6 baseline 行为），改进留作 follow-up。
 */

import fs from "fs";
import type { Evaluator } from "./types";

const GROUNDING_REGEX =
  /data\/(kb\/[^\s)]+\.md|users\.json|system_status\.json|policies\.yaml)/g;

export const groundingEvaluator: Evaluator = {
  key: "grounding",
  applies: (s) => Boolean(s.must_cite_sources?.length || s.must_not_cite?.length),
  evaluate: (run, s) => {
    const cited = (s.must_cite_sources ?? []).filter((p) => run.text.includes(p));
    const wrongly = (s.must_not_cite ?? []).filter((p) => run.text.includes(p));
    const allPaths = Array.from(run.text.matchAll(GROUNDING_REGEX), (m) => m[0]);
    const missingOnDisk = allPaths.filter((p) => !fs.existsSync(p));

    const required = s.must_cite_sources ?? [];
    const allCited = cited.length === required.length;
    const noneWrongly = wrongly.length === 0;
    const allExist = missingOnDisk.length === 0;
    const pass = allCited && noneWrongly && allExist;

    const parts: string[] = [];
    if (!allCited) parts.push(`missing required: [${required.filter((p) => !cited.includes(p)).join(", ")}]`);
    if (!noneWrongly) parts.push(`wrongly cited: [${wrongly.join(", ")}]`);
    if (!allExist) parts.push(`paths not on disk: [${missingOnDisk.join(", ")}]`);
    return {
      key: "grounding",
      score: pass ? 1 : 0,
      comment: pass
        ? `cited [${cited.join(", ") || "n/a"}], no wrongly-cited`
        : parts.join("; "),
    };
  },
};
