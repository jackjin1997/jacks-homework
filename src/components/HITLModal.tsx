"use client";
import { useState } from "react";

export type HITLRequest = {
  tool_name: string;
  tool_args: Record<string, unknown>;
};

export type HITLDecision =
  | { type: "approve" }
  | { type: "reject"; message?: string };
// edit 暂不暴露 UI（v1.6 lock approve/reject；Task 14 spike pass 后再加）

export function HITLModal({
  request,
  onDecideAction,
  onCloseAction,
}: {
  request: HITLRequest;
  onDecideAction: (decision: HITLDecision) => void;
  onCloseAction?: () => void;
}) {
  const [rejectReason, setRejectReason] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(17, 17, 17, 0.32)" }}
    >
      <div
        className="
          bg-surface-1 rounded-xl
          w-full max-w-2xl max-h-[80vh] overflow-y-auto scroll-cream
          border border-hairline
          animate-rise-in
        "
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-hairline-soft">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 inline-flex size-7 items-center justify-center rounded-md bg-semantic-error/10 text-semantic-error text-base font-medium shrink-0"
              aria-hidden
            >
              !
            </span>
            <div className="min-w-0">
              <h2 className="text-[20px] font-medium text-ink tracking-headline leading-tight">
                Agent 请求执行高风险动作
              </h2>
              <p className="text-[14px] text-ink-muted mt-1.5 leading-relaxed">
                请确认以下工具调用，或拒绝并附上原因。
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">
          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-2">
              Tool
            </div>
            <code className="inline-block bg-canvas border border-hairline-soft px-2.5 py-1 rounded-md font-mono text-[13px] text-ink">
              {request.tool_name}
            </code>
          </div>

          <div>
            <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-2">
              Arguments
            </div>
            <pre className="bg-canvas border border-hairline-soft rounded-md p-4 font-mono text-[12.5px] text-ink overflow-x-auto max-h-56 leading-relaxed">
              {JSON.stringify(request.tool_args, null, 2)}
            </pre>
          </div>

          <div>
            <label className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-2 block">
              拒绝原因 / 备注（可选）
            </label>
            <textarea
              placeholder="仅在 reject 时记录"
              className="
                w-full bg-surface-1 border border-hairline rounded-md
                px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-tertiary
                outline-none resize-y
                focus:border-ink focus:ring-1 focus:ring-ink/10
                transition-colors
              "
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-7 py-5 border-t border-hairline-soft flex gap-2 justify-end">
          {onCloseAction && (
            <button
              onClick={onCloseAction}
              className="
                px-4 py-2 rounded-md text-[14px] font-medium
                bg-canvas text-ink-muted
                hover:bg-surface-2 hover:text-ink
                transition-colors
              "
            >
              取消
            </button>
          )}
          <button
            onClick={() =>
              onDecideAction({
                type: "reject",
                message: rejectReason || undefined,
              })
            }
            className="
              px-4 py-2 rounded-md text-[14px] font-medium
              bg-surface-1 text-semantic-error
              border border-semantic-error/30
              hover:bg-semantic-error/5 hover:border-semantic-error
              transition-colors
            "
          >
            拒绝
          </button>
          <button
            onClick={() => onDecideAction({ type: "approve" })}
            className="
              px-4 py-2 rounded-md text-[14px] font-medium
              bg-ink text-on-primary
              hover:bg-inverse-canvas
              transition-colors
            "
          >
            批准
          </button>
        </div>
      </div>
    </div>
  );
}
