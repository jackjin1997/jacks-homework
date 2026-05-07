/**
 * ParallelTools evaluator — diagnose 阶段并行工具调用计数
 *
 * 启发：LangGraph 单次 AI message 上的 tool_calls[] 同步发出 → 视为并行批次。
 * 我们扫描所有 messageIndex 相同的工具调用，找出最大的 batch size，跟 expected_parallel_tool_calls_in_diagnose 比较。
 *
 * 边界：runAgent 目前没有把 tool_call 发生时的 state.currentStep 抽出来（state 在
 * graph 内部演化，message 上没有原生 step 字段）。所以这里"diagnose 阶段"是软约束，
 * 取所有 tool 调用中最大 batch — spec §5.3 要求并行只在 diagnose 发生，故全图最大
 * batch 等价于 diagnose batch。
 */

import type { Evaluator } from "./types";

export const parallelToolsEvaluator: Evaluator = {
  key: "parallel_tools",
  applies: (s) => typeof s.expected_parallel_tool_calls_in_diagnose === "number",
  evaluate: (run, s) => {
    const expected = s.expected_parallel_tool_calls_in_diagnose ?? 0;
    const buckets = new Map<number, number>();
    for (const c of run.toolCalls) {
      buckets.set(c.messageIndex, (buckets.get(c.messageIndex) ?? 0) + 1);
    }
    const maxBatch = buckets.size ? Math.max(...buckets.values()) : 0;
    const pass = maxBatch >= expected;
    return {
      key: "parallel_tools",
      score: pass ? 1 : 0,
      comment: pass
        ? `max parallel batch=${maxBatch} (expected ≥${expected})`
        : `max parallel batch=${maxBatch}, expected ≥${expected}`,
    };
  },
};
