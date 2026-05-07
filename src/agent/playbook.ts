import fs from "fs";
import path from "path";
import { ROOT } from "@/lib/paths";
import type { Step } from "@/contracts/helpdesk_state";

const PLAYBOOK_DIR = path.join(ROOT, "src", "agent", "playbooks");

export function loadStepPrompt(step: Step): string {
  const base = fs.readFileSync(path.join(PLAYBOOK_DIR, "base.md"), "utf-8");
  const stepPrompt = fs.readFileSync(path.join(PLAYBOOK_DIR, `${step}.md`), "utf-8");
  return `${base}\n\n${stepPrompt}`;
}
