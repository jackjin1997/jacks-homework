import "dotenv/config";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { buildAgent } from "@/agent";
import { HandoffPacket } from "@/contracts/handoff_packet";
import type { Evidence } from "@/contracts/evidence";
import { truncateEvidence } from "@/lib/evidence";
import { SessionIdSchema, resolveIdentity } from "@/lib/identity";
import { asRouteAgent } from "@/lib/agent-types";
import { rejectIfEscalateCommitting } from "@/lib/saga-guards";

export async function GET(req: NextRequest) {
  const sessionIdParam = req.nextUrl.searchParams.get("session_id");
  if (!sessionIdParam) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }
  const sessionParse = SessionIdSchema.safeParse(sessionIdParam);
  if (!sessionParse.success) {
    return Response.json({ error: "invalid_session_id", detail: z.flattenError(sessionParse.error) }, { status: 400 });
  }
  const sessionId = sessionParse.data;

  const { userId, threadId } = resolveIdentity(req, { session_id: sessionId });
  const config = { configurable: { thread_id: threadId } };
  const agent = asRouteAgent(buildAgent(() => userId));

  // Fallback: 用户没发过 chat 也能预览 (spec v1.5 B-2)
  await agent.updateState(config, { userId });

  const guard = await rejectIfEscalateCommitting(agent, config, sessionId);
  if (guard) return guard;

  const currentState = await agent.getState(config);
  const evidence = truncateEvidence((currentState?.values?.evidenceCollected as Evidence[]) ?? []);
  const lastUserMessage = (currentState?.values?.lastUserMessage as string | null) ?? null;

  const draft = HandoffPacket.parse({
    user_question: lastUserMessage ?? "(no message provided)",
    evidence_collected: evidence,
    steps_attempted: [],
    why_escalating: "user_requested" as const,
    suggested_next_action: "Human IT engineer to review user-provided context",
    confidence: "low" as const,
  });

  return Response.json({ draft, session_id: sessionId });
}
