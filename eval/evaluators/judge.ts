/**
 * Judge evaluator — LLM-as-judge，对照 LangSmith 官方 best practices 重写
 *
 * 偏离 v1.7 初版的 5 点修正（参考 langsmith-docs/llm_as_judge.mdx + rag.mdx）：
 *   1. zod schema + withStructuredOutput 替代 regex JSON 解析
 *      （项目已有此 pattern：src/summarizer/verifier.ts）
 *   2. JudgeGrade 字段顺序 rationale → pass：模型按字段声明顺序生成，
 *      把 explanation 放前面强制 chain-of-thought（rag.mdx 的 CorrectnessGrade
 *      原话："put explanations before responses because it forces the model
 *      to think through its final response before generating it"）
 *   3. system / user 分离：system 放 grading instructions + criteria，
 *      user 放被评内容；避免模型把 criteria 当成 transcript 的一部分
 *   4. prompt 加 step-by-step + "avoid stating verdict at outset"
 *      （rag.mdx 模板原句）
 *   5. bool pass 替代 1-5 score：消费侧本来就 binary（>=4），让 LLM 直接
 *      输出 bool 比 1-5 数值波动更小（同 case 多次跑变异度大）
 *
 * 仍保留 v1.7 的改进：把 finalState + tool_calls 喂给 judge（解决 baseline
 * 里 composite 场景"实际对了但 judge 看不到"的盲区）。
 */

import { z } from "zod";
import { initChatModel } from "langchain/chat_models/universal";
import type { Evaluator } from "./types";

const JudgeGrade = z.object({
  // ⚠️ 字段顺序敏感：rationale 必须在 pass 之前。模型按声明顺序生成 token，
  // 先生成 rationale 等于强制它 reason 完再下结论。颠倒会触发 self-bias。
  rationale: z.string().describe(
    "Step-by-step reasoning checking each criterion against the agent's final state, tool calls, and transcript. Avoid restating what the agent did — judge it.",
  ),
  pass: z.boolean().describe(
    "True iff ALL criteria are met. If unsure, return false.",
  ),
});
type JudgeGrade = z.infer<typeof JudgeGrade>;

const SYSTEM_INSTRUCTIONS = `You are an evaluator grading an IT helpdesk agent.

You will receive:
- CRITERIA (a list — agent must satisfy ALL of them to pass)
- the agent's FINAL_STATE (scenario, related, current step)
- TOOL_CALLS the agent made (in order)
- TRANSCRIPT_TAIL (last portion of conversation)

Grading rules:
1. Pass only if ALL criteria are met. If you are unsure about any criterion, fail.
2. Reason step by step before concluding. Walk through each criterion explicitly.
3. Avoid stating your final pass/fail verdict at the outset of your reasoning;
   reason through the evidence first, then conclude.
4. Base your judgment on FINAL_STATE and TOOL_CALLS as primary evidence;
   TRANSCRIPT_TAIL is supplementary context.
5. Do not give the agent the benefit of the doubt — absence of evidence in
   the structured fields counts as not satisfied.`;

type StructuredModel = {
  invoke: (
    msgs: Array<{ role: "system" | "user"; content: string }>,
  ) => Promise<unknown>;
};

async function buildJudgeModel(): Promise<StructuredModel> {
  const id =
    process.env.JUDGE_MODEL ??
    process.env.LLM_MODEL ??
    "google-genai:gemini-2.5-pro";
  const baseModel = await initChatModel(id);
  // withStructuredOutput exists at runtime on all chat models but isn't on the
  // universal type — same cast pattern as src/summarizer/verifier.ts.
  return (
    baseModel as unknown as {
      withStructuredOutput: (schema: typeof JudgeGrade) => StructuredModel;
    }
  ).withStructuredOutput(JudgeGrade);
}

export const judgeEvaluator: Evaluator = {
  key: "judge",
  applies: (s) => Array.isArray(s.judge_criteria) && s.judge_criteria.length > 0,
  evaluate: async (run, s) => {
    let model: StructuredModel;
    try {
      model = await buildJudgeModel();
    } catch (e) {
      return {
        key: "judge",
        score: 0,
        comment: `judge model init failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const userPayload = {
      CRITERIA: s.judge_criteria,
      FINAL_STATE: {
        scenario: run.finalState.scenario,
        related: run.finalState.related,
        current_step: run.finalState.currentStep,
      },
      TOOL_CALLS: run.toolCalls.map((c) => c.name),
      TRANSCRIPT_TAIL: run.textTail,
    };

    try {
      const raw = await model.invoke([
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ]);
      const parsed = JudgeGrade.parse(raw);
      return {
        key: "judge",
        score: parsed.pass ? 1 : 0,
        comment: parsed.rationale,
      };
    } catch (e) {
      return {
        key: "judge",
        score: 0,
        comment: `judge invocation/parse failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
