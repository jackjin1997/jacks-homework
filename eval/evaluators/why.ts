/**
 * Why evaluator — expected_why ⊆ {escalate.args.why_escalating}
 *
 * Source of truth：escalate / escalate_user_requested 工具调用的 args.why_escalating
 * （HandoffPacket.why_escalating，spec §3.2）。
 *
 * 语义：yaml 里的 expected_why 是 array，但每个 escalate 调用只有一个 why_escalating
 * 字符串。当前实现要求 expected_why 中至少有一个值与某次 escalate 调用的 why 相符。
 * 这等价于"agent 可以选择 expected_why 列表里的任一原因"。
 *
 * 注意：如果场景没有触发 escalate（不该 escalate 的场景）但 yaml 写了 expected_why，
 * 视为 fail — 这个场景配置本身就矛盾。
 */

import type { Evaluator } from "./types";

const ESCALATE_TOOLS = new Set(["escalate", "escalate_user_requested"]);

export const whyEvaluator: Evaluator = {
  key: "why",
  applies: (s) => Array.isArray(s.expected_why) && s.expected_why.length > 0,
  evaluate: (run, s) => {
    const expected = new Set(s.expected_why ?? []);
    const escalateCalls = run.toolCalls.filter((c) => ESCALATE_TOOLS.has(c.name));
    if (escalateCalls.length === 0) {
      return {
        key: "why",
        score: 0,
        comment: `expected one of [${[...expected].join(", ")}], but no escalate tool called`,
      };
    }
    const actualWhys = escalateCalls
      .map((c) => {
        const args = c.args as { why_escalating?: unknown };
        return String(args?.why_escalating ?? "");
      })
      .filter(Boolean);
    const matched = actualWhys.find((w) => expected.has(w));
    return {
      key: "why",
      score: matched ? 1 : 0,
      comment: matched
        ? `why_escalating=${matched}`
        : `expected one of [${[...expected].join(", ")}], actual=[${actualWhys.join(", ") || "(empty)"}]`,
    };
  },
};
