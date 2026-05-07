import "dotenv/config";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { Command } from "@langchain/langgraph";
import { buildAgent } from "@/agent";
import { SessionIdSchema, resolveIdentity } from "@/lib/identity";
import { extractTextContent } from "@/lib/messages";
import { asRouteAgent } from "@/lib/agent-types";
import { rejectIfEscalateCommitting } from "@/lib/saga-guards";

const ResumeRequestBody = z.object({
  session_id: SessionIdSchema,
  decision: z.discriminatedUnion("type", [
    z.object({ type: z.literal("approve") }),
    z.object({ type: z.literal("reject"), message: z.string().optional() }),
    z.object({ type: z.literal("edit"), editedAction: z.object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
    }) }),
  ]),
}).strict();

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = ResumeRequestBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", detail: z.flattenError(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  const { userId, sessionId, threadId } = resolveIdentity(req, body);
  const config = { configurable: { thread_id: threadId }, recursionLimit: 25 };
  const agent = asRouteAgent(buildAgent(() => userId));

  const guard = await rejectIfEscalateCommitting(agent, config, sessionId);
  if (guard) return guard;

  // LLM 偶尔同 turn batch 多个 high-risk tool — LangChain HITL 严格 1:1 匹配 decisions ↔
  // hanging tool calls, count mismatch 直接抛 'Number of human decisions does not match'。
  // 按实际 hanging 数量复制同一 decision 提交 (cap 10 防失控)。spec §13 R-HITL-MULTI 已登记。
  const stateBefore = await agent.getState(config);
  const hangingCount = Math.min(
    10,
    Math.max(
      1,
      (stateBefore?.tasks ?? []).reduce(
        (acc, t) => acc + ((t.interrupts as unknown[])?.length || 0),
        0,
      ),
    ),
  );
  const decisions = Array(hangingCount).fill(body.decision);

  const result = await agent.invoke(
    new Command({ resume: { decisions } }),
    config,
  ) as { messages?: { content?: unknown }[]; currentStep?: string; __interrupt__?: unknown };
  const last = result.messages?.[result.messages.length - 1];
  return Response.json({
    reply: extractTextContent(last),
    session_id: sessionId,
    currentStep: result.currentStep ?? null,
    interrupted: !!result.__interrupt__,
    interrupt: result.__interrupt__ ?? null,
  });
}
