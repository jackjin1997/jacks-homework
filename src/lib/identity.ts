import { z } from "zod";
import type { NextRequest } from "next/server";

/** session_id 必须是裸 UUID；后端永远拼 thread_id 前缀。zod v4: z.uuid() top-level */
export const SessionIdSchema = z.uuid({ message: "session_id must be a bare UUID; backend prefixes userId" });

/** strict() 显式 reject body 里 userId / thread_id 等伪造字段 */
export const ChatRequestBody = z.object({
  session_id: SessionIdSchema.optional(),
  message: z.string().min(1).max(10_000),
}).strict();

export type ChatRequestBody = z.infer<typeof ChatRequestBody>;

/** 解析 user_id（cookie 或 demo query）+ session_id（裸 UUID）→ thread_id */
export function resolveIdentity(
  req: NextRequest,
  body: { session_id?: string },
): { userId: string; sessionId: string; threadId: string } {
  // userId 只从 cookie / query 读取，**忽略** body 里任何 userId 字段（防伪造）
  const userId = req.nextUrl.searchParams.get("as")
    ?? req.cookies.get("helpdesk_uid")?.value
    ?? "u-001";
  const sessionId = body.session_id
    ? SessionIdSchema.parse(body.session_id)
    : crypto.randomUUID();
  const threadId = `${userId}:${sessionId}`;
  return { userId, sessionId, threadId };
}
