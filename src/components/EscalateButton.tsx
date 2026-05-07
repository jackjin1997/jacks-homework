"use client";

export function EscalateButton({
  onClickAction,
  disabled,
}: {
  onClickAction: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClickAction}
      disabled={disabled}
      title="转人工 IT 工程师"
      className="
        group inline-flex items-center gap-2
        px-3.5 py-2 rounded-md
        bg-surface-1 text-ink
        border border-hairline
        text-[13px] font-medium tracking-tight
        transition-colors duration-150
        hover:bg-surface-2 hover:border-ink/30
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-1
      "
    >
      <span
        className="inline-block size-1.5 rounded-full bg-semantic-error transition-transform duration-150 group-hover:scale-125"
        aria-hidden
      />
      转人工
    </button>
  );
}
