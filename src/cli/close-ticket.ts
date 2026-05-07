#!/usr/bin/env tsx
import "dotenv/config";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN, TICKETS_CLOSED } from "@/lib/paths";
import { summarizeToKB } from "@/summarizer";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          out[a.slice(2)] = next;
          i++;
        } else {
          out[a.slice(2)] = "";
        }
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const id = args["id"];
  const resolution = args["resolution"];
  const chatLog = args["chat-log"];
  if (!id || !resolution) {
    console.error("usage: pnpm helpdesk --id=T-xxx --resolution='...' [--chat-log='...']");
    process.exit(1);
  }
  const ticketFile = path.join(TICKETS_OPEN, `${id}.json`);
  if (!fs.existsSync(ticketFile)) {
    console.error(`Ticket not found: ${ticketFile}`);
    process.exit(1);
  }
  const ticket = JSON.parse(fs.readFileSync(ticketFile, "utf-8"));
  console.log(`[close-ticket] Closing ${id}, summarizing to KB...`);

  const result = await summarizeToKB({
    handoff_packet: ticket.packet,
    resolution,
    chat_log: chatLog,
  });
  console.log(`[close-ticket] verifier score=${result.verifier.score}`);
  console.log(`[close-ticket] KB written to: ${result.written_path}`);

  // move ticket to closed/ + append resolution
  fs.mkdirSync(TICKETS_CLOSED, { recursive: true });
  const closedFile = path.join(TICKETS_CLOSED, `${id}.json`);
  fs.renameSync(ticketFile, closedFile);
  const closed = JSON.parse(fs.readFileSync(closedFile, "utf-8"));
  closed.resolution = resolution;
  closed.closed_at = new Date().toISOString();
  closed.kb_article = result.written_path;
  closed.verifier_score = result.verifier.score;
  fs.writeFileSync(closedFile, JSON.stringify(closed, null, 2));

  console.log(`[close-ticket] done. ticket archived to ${path.relative(process.cwd(), closedFile)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
