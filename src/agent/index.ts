import { createAgent, summarizationMiddleware, humanInTheLoopMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { stepMiddleware } from "./middleware/step";
import { buildAllTools } from "./tools";

/**
 * HITL config — 抽出为模块导出便于单元测试断言 interrupt 集合（修正 v1.5 B-3.5）
 *
 * v1.6 默认 lock ["approve", "reject"]：
 *   research 30 R1 + langchainjs hitl.int.test.ts 用 retry:3 暗示 edit 路径 flaky。
 *   M3 spike 跑 5 次 edit decision；3+ 次成功才考虑改回 ["approve", "edit", "reject"]。
 *
 * 不在 interruptOn 列表的工具（auto_grant_access / escalate_user_requested）不会触发 HITL。
 */
export const hitlConfig: {
  interruptOn: Record<string, { allowedDecisions: ("approve" | "reject" | "edit")[] }>;
} = {
  interruptOn: {
    escalate:                 { allowedDecisions: ["approve", "reject"] },
    create_ticket:            { allowedDecisions: ["approve", "reject"] },
    request_access_approval:  { allowedDecisions: ["approve", "reject"] },
  },
};

/** 共用 checkpointer + agent 单例 — /api/chat / /api/escalate / /api/escalate-preview / /api/resume 都用同一份 */
export const checkpointer = new MemorySaver();
let agentSingleton: ReturnType<typeof createAgent> | null = null;
let cachedUserIdGetter: (() => string) | null = null;

/**
 * Factory: userId 通过 getter 闭包注入工具（spec §3.1 Identity 注入）
 *
 * 单例策略：相同 getter 引用复用 agent；getter 变化时重建。
 * Route 端永远 `buildAgent(() => userId)` — 第一次创建，后续 invoke 复用。
 */
export function buildAgent(userIdGetter: () => string) {
  if (agentSingleton && cachedUserIdGetter === userIdGetter) {
    return agentSingleton;
  }
  cachedUserIdGetter = userIdGetter;
  agentSingleton = createAgent({
    model: process.env.LLM_MODEL ?? "google-genai:gemini-2.5-pro",
    tools: buildAllTools(userIdGetter),
    checkpointer,
    middleware: [
      stepMiddleware,                              // ① 按 step 过滤工具 + 注入 prompt + requires 校验
      summarizationMiddleware({                    // ② token 接近上限时压缩老对话（不动 state 字段）
        model: process.env.SUMMARIZER_MODEL ?? "google-genai:gemini-2.5-flash",
        trigger: { tokens: 8000 },
        keep: { messages: 20 },
      }),
      humanInTheLoopMiddleware(hitlConfig),        // ③ act step 高风险工具 interrupt
    ],
  });
  return agentSingleton;
}

/** Reset for tests */
export function _resetAgentSingleton() {
  agentSingleton = null;
  cachedUserIdGetter = null;
}
