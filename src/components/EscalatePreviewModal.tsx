"use client";
import { useState } from "react";

export type EscalateDraft = {
  user_question: string;
  evidence_collected: Array<{
    source: string;
    excerpt: string;
    timestamp: string;
    tool: string;
  }>;
  steps_attempted: string[];
  why_escalating: string;
  suggested_next_action: string;
  confidence: "high" | "medium" | "low";
};

const CONFIDENCE_TONE: Record<EscalateDraft["confidence"], string> = {
  high: "bg-semantic-success/10 text-[#0a8a3a] border-[#0bdf50]/30",
  medium: "bg-fin-orange/10 text-fin-orange border-fin-orange/30",
  low: "bg-semantic-error/10 text-semantic-error border-semantic-error/30",
};

export function EscalatePreviewModal({
  draft,
  onConfirmAction,
  onCancelAction,
}: {
  draft: EscalateDraft;
  // 修正 codex P2 #6: edited_packet 字段在 spec 承诺但 UI 从未实现 (dead contract).
  // v2 删除入参,只保留 user_note。要恢复编辑能力需先在此 modal 加 packet 字段编辑器。
  onConfirmAction: (extra: { user_note?: string }) => void;
  onCancelAction: () => void;
}) {
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(17, 17, 17, 0.32)" }}
    >
      <div
        className="
          bg-surface-1 rounded-xl
          w-full max-w-xl max-h-[85vh] overflow-y-auto scroll-cream
          border border-hairline
          animate-rise-in
        "
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-hairline-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-1.5">
                Escalation
              </div>
              <h2 className="text-[22px] font-medium text-ink tracking-card-title leading-tight">
                即将转人工
              </h2>
            </div>
            <span
              className={`
                shrink-0 inline-flex items-center gap-1.5
                px-2.5 py-1 rounded-pill border text-[11px] font-medium uppercase tracking-wider
                ${CONFIDENCE_TONE[draft.confidence]}
              `}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {draft.confidence}
            </span>
          </div>
          <p className="text-[14px] text-ink-muted mt-3 leading-relaxed">
            将把以下上下文打包提交给 IT 工程师，确认前可补充备注。
          </p>
        </div>

        {/* Body — structured packet preview */}
        <div className="px-7 py-6 space-y-5">
          <Field label="User question">
            <p className="text-[14px] text-ink leading-relaxed">
              {draft.user_question}
            </p>
          </Field>

          <Field label="Why escalating">
            <p className="text-[14px] text-ink leading-relaxed">
              {draft.why_escalating}
            </p>
          </Field>

          <Field label="Suggested next action">
            <p className="text-[14px] text-ink leading-relaxed">
              {draft.suggested_next_action}
            </p>
          </Field>

          {draft.steps_attempted.length > 0 && (
            <Field label={`Steps attempted (${draft.steps_attempted.length})`}>
              <ul className="space-y-1.5">
                {draft.steps_attempted.map((s, i) => (
                  <li
                    key={i}
                    className="text-[13px] text-ink-muted leading-relaxed flex gap-2"
                  >
                    <span className="text-ink-tertiary shrink-0 font-mono">
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Field>
          )}

          {draft.evidence_collected.length > 0 && (
            <Field label={`Evidence (${draft.evidence_collected.length})`}>
              <ul className="space-y-2">
                {draft.evidence_collected.map((e, i) => (
                  <li
                    key={i}
                    className="bg-canvas border border-hairline-soft rounded-md px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-ink-subtle font-mono">
                      <span className="text-fin-orange">{e.tool}</span>
                      <span className="text-ink-tertiary">·</span>
                      <span className="truncate">{e.source}</span>
                    </div>
                    <p className="text-[13px] text-ink mt-1 leading-relaxed">
                      {e.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            </Field>
          )}

          <Field label="补充备注（可选）">
            <textarea
              placeholder="如 '客户会议 30 分钟后开始'"
              className="
                w-full bg-surface-1 border border-hairline rounded-md
                px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-tertiary
                outline-none resize-y
                focus:border-ink focus:ring-1 focus:ring-ink/10
                transition-colors
              "
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-hairline-soft flex gap-2 justify-end">
          <button
            onClick={onCancelAction}
            className="
              px-4 py-2 rounded-md text-[14px] font-medium
              bg-canvas text-ink-muted
              hover:bg-surface-2 hover:text-ink
              transition-colors
            "
          >
            取消
          </button>
          <button
            onClick={() => onConfirmAction({ user_note: note || undefined })}
            className="
              px-4 py-2 rounded-md text-[14px] font-medium
              bg-ink text-on-primary
              hover:bg-inverse-canvas
              transition-colors
            "
          >
            确认转人工
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
