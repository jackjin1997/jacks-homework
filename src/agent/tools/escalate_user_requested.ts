import fs from "fs/promises";
import path from "path";
import { tool } from "@langchain/core/tools";
import { TICKETS_OPEN } from "@/lib/paths";
import { HandoffPacket } from "@/contracts/handoff_packet";

/**
 * Pure helper: writes an escalation ticket idempotently.
 *
 * Same `ticket_id` always maps to one file, period. Concurrent or retried writes
 * with the same id collapse via the read-validate short-circuit. Mid-write
 * crashes can't leave a half-formed file at the final path because the temp +
 * rename step is atomic on POSIX (rename(2) within one filesystem). A 0-byte or
 * truncated leftover from an earlier failure won't be honored as "already
 * written" because read-validate parses and HandoffPacket-validates the body.
 *
 * Note: durability across power loss / kernel crash is NOT guaranteed (no fsync;
 * see spec §13 R-FSYNC-DURABILITY).
 *
 * Callers:
 * - /api/escalate saga (Step 4): always passes an explicit ticket_id from
 *   state.pendingTicketId (which itself is derived from the client idempotency_key
 *   when present, otherwise server-generated).
 * - escalate_user_requested tool wrapper (LLM path in escalate_prep step):
 *   omits ticket_id; helper generates a fresh `T-${uuid}`.
 */
async function isValidExistingTicket(file: string, expectedId: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    if (raw.length === 0) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.id !== expectedId || parsed?.escalated !== true || parsed?.user_requested !== true) {
      return false;
    }
    return HandoffPacket.safeParse(parsed.packet).success;
  } catch {
    // ENOENT, parse failure, truncated content — all treated as "not present".
    return false;
  }
}

export async function writeEscalationTicket(
  packet: HandoffPacket,
  ticket_id?: string,
): Promise<{ ticket_id: string; file: string; reused: boolean }> {
  const id = ticket_id ?? `T-${crypto.randomUUID()}`;
  const file = path.join(TICKETS_OPEN, `${id}.json`);
  await fs.mkdir(TICKETS_OPEN, { recursive: true });

  if (await isValidExistingTicket(file, id)) {
    return { ticket_id: id, file: path.relative(process.cwd(), file), reused: true };
  }

  // Force why_escalating regardless of input (defensive against LLM-supplied packets).
  const finalPacket = HandoffPacket.parse({ ...packet, why_escalating: "user_requested" });
  const content = JSON.stringify(
    {
      id,
      packet: finalPacket,
      escalated: true,
      user_requested: true,
      created_at: new Date().toISOString(),
    },
    null,
    2,
  );

  const tmpFile = `${file}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmpFile, content);
    await fs.rename(tmpFile, file);
  } catch (e) {
    await fs.unlink(tmpFile).catch(() => {});
    throw e;
  }

  return { ticket_id: id, file: path.relative(process.cwd(), file), reused: false };
}

/**
 * LLM-facing wrapper. Exposed only on `escalate_prep` step. No HITL because the
 * user already decided. Saga route bypasses this in favor of writeEscalationTicket
 * directly so it can supply a deterministic ticket_id for idempotency.
 */
export const escalateUserRequestedTool = tool(
  async (input) => {
    const result = await writeEscalationTicket(input);
    return JSON.stringify({
      ticket_id: result.ticket_id,
      file: result.file,
      escalated: true,
      user_requested: true,
      reused: result.reused,
    });
  },
  {
    name: "escalate_user_requested",
    description:
      "User-initiated escalation. Triggered only by /api/escalate route. NO HITL — user already decided. why_escalating is forced to 'user_requested'. Build packet from state.evidenceCollected (already truncated server-side).",
    schema: HandoffPacket,
  },
);
