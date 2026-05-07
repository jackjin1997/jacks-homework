import "dotenv/config";
import fs from "fs";
import path from "path";
import { initChatModel } from "langchain/chat_models/universal";
import { verifyKBArticle } from "./verifier";
import type { VerifierResult } from "@/contracts/verifier_result";
import { ROOT, KB_DIR } from "@/lib/paths";
import type { HandoffPacket } from "@/contracts/handoff_packet";

const SUMMARIZER_PROMPT = fs.readFileSync(
  path.join(ROOT, "src", "summarizer", "prompt.md"),
  "utf-8",
);

type SummInput = { handoff_packet: HandoffPacket; resolution: string; chat_log?: string };

async function callSummarizer(
  model: Awaited<ReturnType<typeof initChatModel>>,
  input: SummInput,
  feedback?: string,
): Promise<{ filename: string; markdown: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SUMMARIZER_PROMPT },
    { role: "user", content: JSON.stringify(input) },
  ];
  if (feedback) {
    messages.push({
      role: "user",
      content: `Previous attempt was rejected. Reviewer feedback:\n${feedback}\n\nRegenerate strictly addressing these issues.`,
    });
  }
  const out = await model.invoke(messages);
  const text = String((out as { content?: unknown }).content ?? "");
  const m = text.match(/FILENAME:\s*(\S+\.md)\s*\n([\s\S]*)/);
  if (!m) throw new Error("Summarizer output missing FILENAME header. Got:\n" + text.slice(0, 200));
  return { filename: m[1].trim(), markdown: m[2].trim() };
}

export async function summarizeToKB(input: SummInput): Promise<{
  filename: string;
  markdown: string;
  verifier: VerifierResult;
  written_path: string;
}> {
  // Summarizer 用便宜 model (默认 gemini-2.5-flash)
  const summarizerModelId =
    process.env.SUMMARIZER_MODEL ??
    process.env.LLM_MODEL ??
    "google-genai:gemini-2.5-flash";
  const model = await initChatModel(summarizerModelId);

  let { filename, markdown } = await callSummarizer(model, input);
  let verifier = await verifyKBArticle(markdown, input);

  // 不达标 → 用 verifier feedback 重生成 1 次
  if (verifier.score < 3) {
    const retry = await callSummarizer(model, input, verifier.feedback);
    filename = retry.filename;
    markdown = retry.markdown;
    verifier = await verifyKBArticle(markdown, input);
  }

  // 仍不达标 → 标 .draft 后缀，console 警告供人工 review
  // search_kb 已自动跳过 .draft.md (Task 8)
  if (verifier.score < 3) {
    filename = filename.replace(/\.md$/, ".draft.md");
    console.warn(
      `[kb_summarizer] verifier score=${verifier.score}, saved as draft: ${filename}`,
    );
  }

  const dest = path.join(KB_DIR, "incidents", filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, markdown);

  return { filename, markdown, verifier, written_path: path.relative(ROOT, dest) };
}
