import { tool } from "@langchain/core/tools";
import fs from "fs";
import path from "path";
import { TICKETS_OPEN } from "@/lib/paths";
import { HandoffPacket } from "@/contracts/handoff_packet";

export const createTicketTool = tool(
  async (input) => {
    const packet = HandoffPacket.parse(input);  // zod 校验失败直接 throw → agent 重试
    const id = `T-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const file = path.join(TICKETS_OPEN, `${id}.json`);
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ id, packet, escalated: false, created_at: new Date().toISOString() }, null, 2));
    return JSON.stringify({ ticket_id: id, file: path.relative(process.cwd(), file) });
  },
  {
    name: "create_ticket",
    description: "Create a non-escalated tracking ticket. Use when you've given a resolution but want to record the interaction. Argument is a HandoffPacket.",
    schema: HandoffPacket,
  },
);
