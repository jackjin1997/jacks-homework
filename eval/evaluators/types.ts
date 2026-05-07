/**
 * Evaluator 模式（参考 LangSmith / OpenEvals）
 *
 * - 每个 expected_* 字段对应一个 evaluator
 * - evaluator 是纯函数：(run, scenario) => Result，无副作用
 * - 多个 evaluator 同时作用于同一份 RunOutput，独立打分
 * - applies(scenario) 决定该 evaluator 是否对该场景生效（yaml 字段缺失则 skip）
 */

export type Scenario = {
  id: string;
  category?: string;
  user_input?: string;
  turns?: Array<{
    user: string;
    expected_agent_intent?: string;
    expected_tool_calls?: string[];
  }>;
  expected_action?: "act_resolve_or_escalate" | "escalate" | string;
  /** Specific tool that MUST appear in toolCalls. Use to disambiguate within act path
   *  (e.g. request_access_approval vs auto_grant_access) where expected_action alone is too coarse. */
  expected_tool?: string;
  expected_why?: string[];
  expected_scenario?: string;
  expected_related?: string[];
  expected_parallel_tool_calls_in_diagnose?: number;
  must_cite_sources?: string[];
  must_not_cite?: string[];
  inject_tool_failure?: { tool: string; error: string };
  setup?: { create_draft_kb?: string };
  judge_criteria?: string[];
  trigger?: string;
};

export type ToolCallTrace = {
  name: string;
  args: Record<string, unknown>;
  /** state.currentStep at the time the agent emitted the tool call (best-effort) */
  step?: string;
  /** Index in messages — used for "concurrent" detection (same AI message → parallel) */
  messageIndex: number;
};

export type FinalStateSnapshot = {
  currentStep?: string;
  scenario?: string | null;
  related?: string[];
};

export type RunOutput = {
  /** Reduced final state from the graph (only fields evaluators care about) */
  finalState: FinalStateSnapshot;
  /** All tool calls flattened in order */
  toolCalls: ToolCallTrace[];
  /** Raw concatenated text of all messages — for grounding regex + judge prompt */
  text: string;
  /** Last 800 chars of `text` — judge input */
  textTail: string;
};

export type EvaluatorResult = {
  /** Stable key, e.g. "grounding", "action", "why" — used in reports/aggregation */
  key: string;
  /** 0 = fail, 1 = pass; null = skipped (evaluator did not apply to this scenario) */
  score: 0 | 1 | null;
  /** Human-readable rationale; required when score is 0 or null */
  comment: string;
};

export type Evaluator = {
  key: string;
  /** True if this scenario has the field(s) this evaluator targets */
  applies: (s: Scenario) => boolean;
  evaluate: (run: RunOutput, s: Scenario) => Promise<EvaluatorResult> | EvaluatorResult;
};
