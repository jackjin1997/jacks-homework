/**
 * Run function — 执行 agent 一次，把 raw 结果归一化成 RunOutput。
 *
 * 参考 LangSmith：evaluator 不应该直接看 raw messages，而是看结构化 RunOutput。
 * 这里做三件事：
 *   1. invoke agent（含 HITL auto-approve 循环）
 *   2. 从 messages 抽 tool_calls（trajectory）
 *   3. 把 final state 字段平铺到顶层（scenario / related / currentStep）
 */

import { Command } from "@langchain/langgraph";
import { buildAgent, _resetAgentSingleton } from "@/agent";
import type { RunOutput, Scenario, ToolCallTrace } from "./evaluators/types";

const HITL_MAX_RESUMES = 3;

/**
 * Minimal duck-typed shape we read off LangChain messages — avoids importing
 * heavy BaseMessage types just to extract tool_calls + content.
 */
type EvalMessage = {
  content?: unknown;
  tool_calls?: Array<{ name?: string; args?: unknown; id?: string }>;
};

type AgentInvokeResult = {
  messages?: EvalMessage[];
  currentStep?: string;
  scenario?: string | null;
  related?: string[];
  __interrupt__?: unknown;
};

function extractToolCalls(messages: EvalMessage[]): ToolCallTrace[] {
  const calls: ToolCallTrace[] = [];
  messages.forEach((m, idx) => {
    const tc = m.tool_calls;
    if (Array.isArray(tc)) {
      for (const c of tc) {
        calls.push({
          name: String(c.name ?? ""),
          args: (c.args ?? {}) as Record<string, unknown>,
          messageIndex: idx,
        });
      }
    }
  });
  return calls;
}

export async function runAgent(s: Scenario): Promise<RunOutput> {
  _resetAgentSingleton();
  const userId = "u-001";
  const agent = buildAgent(() => userId);
  const cfg = {
    configurable: { thread_id: `eval-${s.id}-${Date.now()}` },
    recursionLimit: 25,
  };

  // updateState is a runtime method on compiled CompiledStateGraph; not exposed
  // through createAgent's public type. Casting through unknown keeps the rest typed.
  await (agent as unknown as { updateState: (cfg: unknown, state: unknown) => Promise<void> })
    .updateState(cfg, { userId, lastUserMessage: s.user_input ?? "" });

  let result = (await agent.invoke(
    { messages: [{ role: "user", content: s.user_input ?? "" }] },
    cfg,
  )) as AgentInvokeResult;
  let resumes = 0;
  while (result.__interrupt__ && resumes++ < HITL_MAX_RESUMES) {
    result = (await agent.invoke(
      new Command({ resume: { decisions: [{ type: "approve" }] } }),
      cfg,
    )) as AgentInvokeResult;
  }

  const messages = result.messages ?? [];
  const text = messages.map((m) => String(m.content ?? "")).join("\n");
  const toolCalls = extractToolCalls(messages);

  // currentStep 在 reducer 之后是 last-value；scenario / related 也是 graph 上的字段
  const finalState = {
    currentStep: result.currentStep,
    scenario: result.scenario ?? null,
    related: result.related ?? [],
  };

  return {
    finalState,
    toolCalls,
    text,
    textTail: text.slice(-800),
  };
}
