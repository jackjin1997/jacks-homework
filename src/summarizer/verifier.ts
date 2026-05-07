import "dotenv/config";
import fs from "fs";
import path from "path";
import { initChatModel } from "langchain/chat_models/universal";
import { VerifierResult } from "@/contracts/verifier_result";
import { ROOT } from "@/lib/paths";
import type { HandoffPacket } from "@/contracts/handoff_packet";

const VERIFIER_PROMPT = fs.readFileSync(
  path.join(ROOT, "src", "summarizer", "verifier_prompt.md"),
  "utf-8",
);

/**
 * Cross-model verifier — 减 self-judge bias (spec §5.6 / R6-JUDGE)
 * Fallback chain: VERIFIER_MODEL → SUMMARIZER_MODEL → LLM_MODEL → gemini-2.5-pro
 *
 * 每一步用 try-catch 兜底：如果 model id 设了但对应 API key 缺失（如 VERIFIER_MODEL=anthropic
 * 但无 ANTHROPIC_API_KEY），自动降级到下一个候选。避免设了 cross-model 但 key 缺失时直接 throw。
 */
async function tryInitModel(id: string | undefined): Promise<Awaited<ReturnType<typeof initChatModel>> | null> {
  if (!id) return null;
  try {
    return await initChatModel(id);
  } catch (e) {
    console.warn(`[verifier] failed to init model "${id}" (likely missing API key); falling back. Cause: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

type StructuredOutputChatModel = Awaited<ReturnType<typeof initChatModel>> & {
  withStructuredOutput: (
    schema: typeof VerifierResult,
  ) => {
    invoke: (
      messages: Array<{ role: "system" | "user"; content: string }>,
    ) => Promise<unknown>;
  };
};

export async function verifyKBArticle(
  markdown: string,
  originalInput: { handoff_packet: HandoffPacket; resolution: string; chat_log?: string },
): Promise<VerifierResult> {
  const candidates = [
    process.env.VERIFIER_MODEL,
    process.env.SUMMARIZER_MODEL,
    process.env.LLM_MODEL,
    "google-genai:gemini-2.5-pro",
  ];
  let baseModel: Awaited<ReturnType<typeof initChatModel>> | null = null;
  for (const id of candidates) {
    baseModel = await tryInitModel(id);
    if (baseModel) break;
  }
  if (!baseModel) {
    throw new Error("[verifier] no usable model in fallback chain (set GOOGLE_API_KEY at minimum)");
  }
  const model = (baseModel as StructuredOutputChatModel).withStructuredOutput(VerifierResult);

  const result = await model.invoke([
    { role: "system", content: VERIFIER_PROMPT },
    {
      role: "user",
      content: JSON.stringify({ generated_kb: markdown, original_input: originalInput }),
    },
  ]);
  return VerifierResult.parse(result);
}
