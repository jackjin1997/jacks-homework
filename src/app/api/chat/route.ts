import "dotenv/config";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { buildAgent } from "@/agent";
import { ChatRequestBody, resolveIdentity } from "@/lib/identity";
import { extractTextContent } from "@/lib/messages";
import { asRouteAgent } from "@/lib/agent-types";
import { rejectIfEscalateCommitting } from "@/lib/saga-guards";

/**
 * /api/chat — NDJSON streaming (one JSON event per line)
 *
 * Event shape: { mode: "messages" | "updates" | "meta" | "final" | "error", payload: ... }
 * - meta:     初始化事件，含 session_id (前端首次 fetch 时即可拿到)
 * - messages: LLM token chunk — payload = { text } 已 normalize 为 string
 * - updates:  state diff — payload = { interrupted, interrupt, currentStep, scenario }
 *             interrupt 出现时前端弹 HITL Modal
 * - final:    流结束的最终汇总 — 含 final currentStep / scenario / interrupted
 * - error:    异常
 *
 * 用 NDJSON 而非 text/event-stream: 单行 JSON.parse 简洁；fetch ReadableStream 友好。
 */
export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = ChatRequestBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", detail: z.flattenError(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  const { userId, sessionId, threadId } = resolveIdentity(req, body);
  const config = { configurable: { thread_id: threadId }, recursionLimit: 25 };
  const agent = asRouteAgent(buildAgent(() => userId));

  // chat 不能自动从 escalate_committing 推进 — 必须让用户走 escalate retry。
  // 不抢救 lastUserMessage 是故意的: 防止覆盖 saga state 让 recovery 拿错上下文。
  const guard = await rejectIfEscalateCommitting(agent, config, sessionId);
  if (guard) return guard;

  await agent.updateState(config, { userId, lastUserMessage: body.message });

  const encoder = new TextEncoder();
  const writeEvent = (controller: ReadableStreamDefaultController, mode: string, payload: unknown) => {
    controller.enqueue(encoder.encode(JSON.stringify({ mode, payload }) + "\n"));
  };

  const stream = new ReadableStream({
    async start(controller) {
      // 首先 emit meta event,前端立刻拿到 session_id (用于后续 /api/escalate-preview 等)
      writeEvent(controller, "meta", { session_id: sessionId });

      try {
        const agentStream = await agent.stream(
          { messages: [{ role: "user", content: body.message }] },
          { ...config, streamMode: ["updates", "messages"] },
        );

        for await (const chunk of agentStream) {
          // chunk = [mode, payload] tuple (multi streamMode)
          if (!Array.isArray(chunk) || chunk.length < 2) continue;
          const [mode, payload] = chunk as [string, unknown];

          if (mode === "messages") {
            // payload = [message_chunk, metadata]
            const msgChunk = Array.isArray(payload) ? payload[0] : payload;
            const text = extractTextContent(msgChunk as never);
            if (text) writeEvent(controller, "messages", { text });
          } else if (mode === "updates") {
            // payload = { [node_name]: state_diff }, 可能含 __interrupt__
            const updates = payload as Record<string, unknown>;
            const interruptKey = Object.keys(updates).find((k) => k === "__interrupt__");
            if (interruptKey) {
              writeEvent(controller, "updates", { interrupted: true, interrupt: updates[interruptKey] });
            } else {
              // 提取 currentStep / scenario 变化
              for (const nodeName of Object.keys(updates)) {
                const diff = updates[nodeName] as Record<string, unknown> | null;
                if (!diff || typeof diff !== "object") continue;
                if ("currentStep" in diff || "scenario" in diff) {
                  writeEvent(controller, "updates", {
                    currentStep: diff.currentStep,
                    scenario: diff.scenario,
                  });
                }
              }
            }
          }
        }

        const finalState = await agent.getState(config);
        writeEvent(controller, "final", {
          session_id: sessionId,
          currentStep: finalState?.values?.currentStep ?? null,
          scenario: finalState?.values?.scenario ?? null,
          interrupted: !!(finalState?.tasks?.some((t) => t.interrupts?.length)),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        writeEvent(controller, "error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff",
    },
  });
}
