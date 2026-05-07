import { z } from "zod";
import { Evidence } from "./evidence";

// v1.8 (2026-05-07): 删除 `agent_detected_user_change_of_mind` (v1.3.1 P1-9 引入)。
// 接收升级的 IT 同事不区分"用户按按钮 vs 改主意"，NLU 兜底分类负担与"对话式诊断 → 提
// 澄清问题"的题目要求相悖。改主意场景改由 agent 主动 ask clarifying question 处理
// （详见 playbooks/act.md），用户最终决定升级时按 🔴 按钮 (仍走 user_requested)。
export const WhyEscalating = z.enum([
  "no_kb_match",
  "manager_approval_required",
  "active_incident",
  "out_of_scope",
  "user_requested",                                 // 严格按钮触发（spec §2.3）
]);

export const HandoffPacket = z.object({
  user_question: z.string().min(1).max(2000),
  evidence_collected: z.array(Evidence).max(10, "evidence truncated to last 10 entries"),
  steps_attempted: z.array(z.string().max(500)).max(20),
  why_escalating: WhyEscalating,
  suggested_next_action: z.string().min(1).max(1000),
  confidence: z.enum(["high", "medium", "low"]),
});

export type HandoffPacket = z.infer<typeof HandoffPacket>;
