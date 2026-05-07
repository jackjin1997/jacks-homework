import "dotenv/config";
import { z } from "zod";
import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN, TICKETS_CLOSED } from "@/lib/paths";
import { summarizeToKB } from "@/summarizer";

const CloseTicketBody = z.object({
  id: z.string().regex(/^T-/, "ticket id must start with T-"),
  resolution: z.string().min(1).max(10_000),
  chat_log: z.string().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CloseTicketBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", detail: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { id, resolution, chat_log } = parsed.data;

  const ticketFile = path.join(TICKETS_OPEN, `${id}.json`);
  if (!fs.existsSync(ticketFile)) {
    return Response.json({ error: "ticket_not_found", id }, { status: 404 });
  }
  const ticket = JSON.parse(fs.readFileSync(ticketFile, "utf-8"));

  const result = await summarizeToKB({
    handoff_packet: ticket.packet,
    resolution,
    chat_log,
  });

  // move + append
  fs.mkdirSync(TICKETS_CLOSED, { recursive: true });
  const closedPath = path.join(TICKETS_CLOSED, `${id}.json`);
  fs.renameSync(ticketFile, closedPath);
  const closed = JSON.parse(fs.readFileSync(closedPath, "utf-8"));
  closed.resolution = resolution;
  closed.closed_at = new Date().toISOString();
  closed.kb_article = result.written_path;
  closed.verifier_score = result.verifier.score;
  fs.writeFileSync(closedPath, JSON.stringify(closed, null, 2));

  return Response.json({
    kb_article: result.written_path,
    verifier_score: result.verifier.score,
    issues: result.verifier.issues,
  });
}
