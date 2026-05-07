import { z } from "zod";
import { registry } from "@langchain/langgraph/zod";
import { Evidence } from "./evidence";
import { HandoffPacket } from "./handoff_packet";

/**
 * STEPS:
 * - triage / diagnose / decide / act / escalate_prep — 5 LLM working steps (spec §5.1)
 * - escalate_committing — saga sentinel; never invokes the LLM. Set by /api/escalate
 *   Step 3 commit-lock and cleared by Step 5 finalize. If Step 4 (ticket write) fails,
 *   state remains here so the next escalate attempt enters the recovery path and
 *   reuses editedPacket + pendingTicketId rather than starting a fresh ticket.
 *   stepMiddleware throws on this step (chat self-heal must intercept first).
 */
export const STEPS = [
  "triage",
  "diagnose",
  "decide",
  "act",
  "escalate_prep",
  "escalate_committing",
] as const;
export type Step = (typeof STEPS)[number];

/**
 * evidenceCollected 用 array-concat reducer:
 * spec §5.3 让 search_kb / get_user / get_system_status / check_policy 在 diagnose step
 * 并行调用，每个 tool 返回 Command({ update: { evidenceCollected: [...] } })。
 * 默认 LangGraph channel 是 LastValue，并行写入会抛 InvalidUpdateError。
 * 用 reducer 把多个并行 update 合并为追加。
 *
 * zod v4 + langgraph 1.x 用 .register(registry, meta) 标 reducer（withLangGraph 是 v3 API）。
 */
const EvidenceArrayWithReducer = z
  .array(Evidence)
  .default([])
  .register(registry, {
    reducer: {
      fn: (existing: Evidence[] | undefined, update: Evidence[]) =>
        [...(existing ?? []), ...(update ?? [])],
    },
    default: () => [],
  });

export const HelpdeskStateSchema = z.object({
  currentStep: z.enum(STEPS).default("triage"),
  scenario: z.string().nullable().default(null),
  related: z.array(z.string()).default([]),
  userId: z.string().nullable().default(null),
  evidenceCollected: EvidenceArrayWithReducer,
  backtrackCount: z.number().int().nonnegative().default(0),
  editedPacket: HandoffPacket.nullable().default(null),
  lastUserMessage: z.string().nullable().default(null),
  /**
   * Idempotency key used by saga Step 4: same ticket_id always maps to one file.
   * Set by Step 3 commit-lock (derived from client idempotency_key when present,
   * otherwise server-generated UUID). Cleared by Step 5 finalize. The recovery path
   * (Step 1 sees currentStep == "escalate_committing") reuses this id so a retried
   * Step 4 hits the helper's read-validate short-circuit instead of writing twice.
   */
  pendingTicketId: z.string().nullable().default(null),
});

export type HelpdeskState = z.infer<typeof HelpdeskStateSchema>;
