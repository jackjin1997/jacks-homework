import "dotenv/config";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { Command } from "@langchain/langgraph";
import { buildAgent } from "@/agent";
import { HandoffPacket } from "@/contracts/handoff_packet";
import type { Evidence } from "@/contracts/evidence";
import { truncateEvidence } from "@/lib/evidence";
import { SessionIdSchema, resolveIdentity } from "@/lib/identity";
import { asRouteAgent, type RouteAgent } from "@/lib/agent-types";
import { writeEscalationTicket } from "@/agent/tools/escalate_user_requested";

/**
 * /api/escalate — POST: 用户主动升级 (5-step saga, spec §5.5).
 *
 * Idempotency invariants:
 *   - Ticket file path is keyed by `pendingTicketId`; helper short-circuits on
 *     valid existing file. Same id ⇒ same ticket file, always.
 *   - Step 4 failure leaves `currentStep == "escalate_committing"` + packet +
 *     pendingTicketId so retry's Step 1 enters recovery and reuses the same id.
 *   - `idempotency_key` from the client (Stripe-style) maps to `T-cli-{key}` so
 *     retries after Step 5 finalize (where state is reset) still collapse to
 *     the same ticket file.
 *   - process-local mutex serializes same-thread concurrent requests; serverless
 *     multi-worker requires a distributed lock (see §13 R-CONCURRENT-WRITE).
 */
const EscalateRequestBody = z
  .object({
    session_id: SessionIdSchema,
    user_note: z.string().max(2000).optional(),
    idempotency_key: z.uuid().optional(),
  })
  .strict();

const escalateLocks = new Map<string, Promise<unknown>>();

async function withEscalateLock<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
  // `prev.then(fn, fn)` runs `fn` whether prev resolved or rejected — by design,
  // a failed previous request must not block the next one.
  const prev = escalateLocks.get(threadId) ?? Promise.resolve();
  const ran = prev.then(fn, fn);
  const tail = ran.catch(() => undefined);
  escalateLocks.set(threadId, tail);
  try {
    return await ran;
  } finally {
    if (escalateLocks.get(threadId) === tail) {
      escalateLocks.delete(threadId);
    }
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = EscalateRequestBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", detail: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const { userId, sessionId, threadId } = resolveIdentity(req, body);

  return withEscalateLock(threadId, () => runSaga(body, userId, sessionId, threadId));
}

async function runSaga(
  body: z.infer<typeof EscalateRequestBody>,
  userId: string,
  sessionId: string,
  threadId: string,
): Promise<Response> {
  const config = { configurable: { thread_id: threadId }, recursionLimit: 25 };
  const agent: RouteAgent = asRouteAgent(buildAgent(() => userId));

  // userId fallback for users who escalate before sending any chat message (spec §3.1).
  await agent.updateState(config, { userId });

  // Step 1: lock check (idempotency + recovery)
  const initialState = await agent.getState(config);
  const initialValues = initialState?.values ?? {};
  const initialStep = (initialValues.currentStep as string) ?? "triage";
  const initialPacket = (initialValues.editedPacket as HandoffPacket | null) ?? null;
  const initialPendingId = (initialValues.pendingTicketId as string | null) ?? null;

  let recoveryPacket: HandoffPacket | null = null;
  let recoveryTicketId: string | null = null;
  if (initialStep === "escalate_committing") {
    if (!initialPacket || !initialPendingId) {
      // currentStep is set by commit-lock atomically with both other fields, so this is unreachable.
      return Response.json(
        {
          error: "saga_corrupt_state",
          detail:
            "Found currentStep='escalate_committing' without editedPacket or pendingTicketId. Manual recovery needed.",
        },
        { status: 500 },
      );
    }
    recoveryPacket = initialPacket;
    recoveryTicketId = initialPendingId;
  }

  // Step 2: drain HITL (skip in recovery — already drained)
  if (!recoveryPacket) {
    const hangingTasks = (initialState?.tasks ?? []).filter(
      (t) => Array.isArray(t.interrupts) && t.interrupts.length > 0,
    );
    if (hangingTasks.length > 0) {
      const decisionsCount = Math.min(
        10,
        hangingTasks.reduce((acc, t) => acc + ((t.interrupts as unknown[]).length || 1), 0),
      );
      try {
        await agent.invoke(
          new Command({
            resume: {
              decisions: Array(decisionsCount).fill({
                type: "reject",
                message: "user requested escalation, abandoning prior interrupt",
              }),
            },
          }),
          config,
        );
      } catch (e) {
        return Response.json(
          {
            error: "hitl_drain_throw",
            detail: "Could not abandon prior HITL interrupt. Retry or refresh.",
            cause: e instanceof Error ? e.message : String(e),
          },
          { status: 503 },
        );
      }
      // Drain succeeding (no throw) doesn't prove interrupts cleared — re-read to verify.
      // A race window remains between this re-read and the commit lock below; mutex +
      // ticket_id idempotency keep ticket uniqueness (see §13 R-CONCURRENT-WRITE).
      const reread = await agent.getState(config);
      const stillHanging = (reread?.tasks ?? []).some(
        (t) => Array.isArray(t.interrupts) && t.interrupts.length > 0,
      );
      if (stillHanging) {
        return Response.json(
          {
            error: "hitl_drain_incomplete",
            detail: "HITL drain returned without throwing but interrupts still pending. Refresh and retry.",
          },
          { status: 503 },
        );
      }
    }
  }

  // Step 3: build packet + commit lock + ticket_id
  let packetToCommit: HandoffPacket;
  let ticketIdToWrite: string;
  if (recoveryPacket && recoveryTicketId) {
    packetToCommit = recoveryPacket;
    ticketIdToWrite = recoveryTicketId;
  } else {
    const rawEvidence = (initialValues.evidenceCollected as Evidence[] | undefined) ?? [];
    const lastUserMessage = (initialValues.lastUserMessage as string | null) ?? null;
    const safeUserNote = body.user_note?.trim();

    packetToCommit = HandoffPacket.parse({
      user_question: lastUserMessage ?? "(no message provided)",
      evidence_collected: truncateEvidence(rawEvidence),
      steps_attempted: [],
      why_escalating: "user_requested" as const,
      suggested_next_action: safeUserNote
        ? `Human IT engineer to review user-provided context. User note: ${safeUserNote.slice(0, 500)}`
        : "Human IT engineer to review user-provided context",
      confidence: "low" as const,
    });

    // Prefer the client's idempotency_key (zod-validated UUID) so a retry after Step 5
    // finalize still collapses to the same ticket file via helper short-circuit.
    // T-cli- prefix prevents collision with server-generated T-{uuid}.
    ticketIdToWrite = body.idempotency_key
      ? `T-cli-${body.idempotency_key}`
      : `T-${crypto.randomUUID()}`;

    try {
      await agent.updateState(config, {
        currentStep: "escalate_committing",
        editedPacket: packetToCommit,
        pendingTicketId: ticketIdToWrite,
      });
    } catch (e) {
      return Response.json(
        {
          error: "commit_lock_failed",
          detail: "Could not write commit lock to state. Retry safe.",
          cause: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  }

  // Step 4: write ticket. Helper short-circuits if a valid file exists for this id.
  // On failure, state stays in escalate_committing so the next request enters recovery.
  let writeResult: { ticket_id: string; file: string; reused: boolean };
  try {
    writeResult = await writeEscalationTicket(packetToCommit, ticketIdToWrite);
  } catch (e) {
    return Response.json(
      {
        error: "ticket_write_failed",
        detail:
          "Ticket file write failed. State preserved for retry — call /api/escalate again to retry (recovery is idempotent).",
        cause: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  // Step 5: finalize. Ticket is already written, so a reset failure must not surface as
  // a user-visible error — the new_session_id makes any stale state in this thread unreachable.
  // evidenceCollected isn't reset because its reducer is array-concat with no in-place clear;
  // isolation comes from the client switching to new_session_id (see §13 R-ESCALATE-EDGE).
  const newSessionId = crypto.randomUUID();

  try {
    await agent.updateState(config, {
      currentStep: "triage",
      editedPacket: null,
      pendingTicketId: null,
      scenario: null,
      related: [],
      backtrackCount: 0,
    });
  } catch (e) {
    console.warn(
      `[escalate-saga] state reset failed after ticket ${writeResult.ticket_id}: ${e instanceof Error ? e.message : String(e)}. ` +
        `Old thread ${threadId} stale; new_session_id ${newSessionId} issued.`,
    );
  }

  return Response.json({
    session_id: sessionId,
    new_session_id: newSessionId,
    currentStep: "triage",
    ticket_id: writeResult.ticket_id,
    file: writeResult.file,
    reused: writeResult.reused,
    reply: `已升级，工单 ${writeResult.ticket_id} 已创建。IT 工程师会尽快联系您。本对话已归档,新问题请在新对话框中开始。`,
    interrupted: false,
    interrupt: null,
    recovered: !!recoveryPacket,
  });
}
