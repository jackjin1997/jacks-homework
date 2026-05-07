import type { Evidence } from "@/contracts/evidence";

/**
 * 服务端确定性裁剪 — 不靠 LLM 遵守 prompt。
 * 修正 v1.3.1 P1-4：用户在 EscalatePreviewModal 编辑也无法绕过（escalate POST 调同一个 helper + zod max 双保护）。
 *
 * - 最多 last 10 条 evidence
 * - 每条 excerpt ≤ 200 chars（超出截断 + "..."）
 */
export function truncateEvidence(items: Evidence[]): Evidence[] {
  return items.slice(-10).map((e) => ({
    ...e,
    excerpt: e.excerpt.length > 200 ? e.excerpt.slice(0, 197) + "..." : e.excerpt,
  }));
}
