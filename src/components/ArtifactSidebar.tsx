"use client";

export type Artifact = {
  type: "citation" | "ticket";
  label: string;
  url?: string;
};

const TYPE_TONE: Record<Artifact["type"], { dot: string; tag: string }> = {
  citation: {
    dot: "bg-ink-tertiary",
    tag: "text-ink-subtle",
  },
  ticket: {
    dot: "bg-fin-orange",
    tag: "text-fin-orange",
  },
};

export function ArtifactSidebar({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return null;

  const citations = artifacts.filter((a) => a.type === "citation");
  const tickets = artifacts.filter((a) => a.type === "ticket");

  return (
    <aside
      className="
        hidden md:flex flex-col w-80 shrink-0
        border-l border-hairline-soft
        bg-canvas
        overflow-y-auto scroll-cream
      "
    >
      <div className="px-6 pt-6 pb-4 border-b border-hairline-soft">
        <div className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider">
          Session
        </div>
        <h3 className="text-[18px] font-medium text-ink tracking-card-title leading-tight mt-0.5">
          引用与产物
        </h3>
        <p className="text-[12px] text-ink-tertiary mt-1.5">
          {tickets.length} 工单 · {citations.length} 引用
        </p>
      </div>

      <div className="flex-1 px-6 py-5 space-y-6">
        {tickets.length > 0 && (
          <Group title="Tickets" count={tickets.length}>
            {tickets.map((a, i) => (
              <ArtifactRow key={`t-${i}`} artifact={a} />
            ))}
          </Group>
        )}
        {citations.length > 0 && (
          <Group title="Citations" count={citations.length}>
            {citations.map((a, i) => (
              <ArtifactRow key={`c-${i}`} artifact={a} />
            ))}
          </Group>
        )}
      </div>
    </aside>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h4 className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider">
          {title}
        </h4>
        <span className="font-mono text-[11px] text-ink-tertiary">
          {count.toString().padStart(2, "0")}
        </span>
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

function ArtifactRow({ artifact }: { artifact: Artifact }) {
  const tone = TYPE_TONE[artifact.type];
  const Inner = (
    <span
      className="
        flex items-start gap-2.5 px-3 py-2.5 rounded-md
        bg-surface-1 border border-hairline-soft
        transition-colors
        hover:border-hairline hover:bg-surface-1
      "
    >
      <span
        className={`mt-1.5 size-1.5 rounded-full shrink-0 ${tone.dot}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[10px] font-medium uppercase tracking-wider ${tone.tag}`}
        >
          {artifact.type}
        </span>
        <span className="block font-mono text-[12px] text-ink break-all leading-snug mt-0.5">
          {artifact.label}
        </span>
      </span>
    </span>
  );

  return (
    <li>
      {artifact.url ? (
        <a
          href={artifact.url}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          {Inner}
        </a>
      ) : (
        Inner
      )}
    </li>
  );
}
