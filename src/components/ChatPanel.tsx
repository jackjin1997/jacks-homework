"use client";
import { useState, useRef, useEffect } from "react";
import { HITLModal, type HITLRequest, type HITLDecision } from "./HITLModal";
import { EscalateButton } from "./EscalateButton";
import {
  EscalatePreviewModal,
  type EscalateDraft,
} from "./EscalatePreviewModal";
import { ArtifactSidebar, type Artifact } from "./ArtifactSidebar";

type Msg = { role: "user" | "assistant"; content: string };

const STEP_LABEL: Record<string, string> = {
  triage: "分诊",
  retrieve: "检索",
  diagnose: "诊断",
  act: "执行",
  escalate_prep: "转人工",
  done: "完成",
};

const SUGGESTIONS = [
  "我的 VPN 一直连不上",
  "Outlook 邮箱无法发送附件",
  "笔记本电脑频繁蓝屏，已尝试重启",
  "Slack 桌面端启动后白屏",
];

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);   // chat 流式 token 生成中（vs loading 涵盖 escalate / resume）
  const [hitl, setHitl] = useState<HITLRequest | null>(null);
  const [step, setStep] = useState<string>("triage");
  const [previewDraft, setPreviewDraft] = useState<EscalateDraft | null>(null);
  const [escalating, setEscalating] = useState(false);
  // Held across modal retries / network failures so the same intent always maps to one ticket
  // (server uses it as the ticket_id idempotency key). Cleared on confirmed success.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const threadId = useRef<string>(crypto.randomUUID());
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / streaming tokens
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function handleResponse(data: {
    reply?: string;
    session_id?: string;
    currentStep?: string;
    interrupted?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interrupt?: any;
  }) {
    if (data.currentStep) setStep(data.currentStep);

    if (data.interrupted && data.interrupt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intr: any = Array.isArray(data.interrupt)
        ? data.interrupt[0]
        : data.interrupt;
      const action =
        intr?.value?.action_request ?? intr?.value ?? intr?.action_request ?? {};
      setHitl({
        tool_name: action.action ?? action.name ?? "unknown",
        tool_args: action.args ?? {},
      });
    } else {
      setHitl(null);
    }

    if (data.reply) {
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      extractArtifactsFromText(data.reply);
    }
  }

  /** Append text to the last assistant message (or create one if last is user) */
  function appendAssistantToken(text: string) {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last?.role === "assistant") {
        const copy = [...m];
        copy[copy.length - 1] = { ...last, content: last.content + text };
        return copy;
      }
      return [...m, { role: "assistant", content: text }];
    });
  }

  /** Extract KB / ticket citations from accumulated assistant content (called on stream end) */
  function extractArtifactsFromText(text: string) {
    const citationRe =
      /data\/(kb\/[^\s)]+\.md|users\.json|system_status\.json|policies\.yaml)/g;
    const newCitations: Artifact[] = [...text.matchAll(citationRe)].map((m) => ({
      type: "citation" as const,
      label: m[1],
    }));
    const ticketRe = /T-[\w\-:.]+\.json/g;
    const newTickets: Artifact[] = [...text.matchAll(ticketRe)].map((m) => ({
      type: "ticket" as const,
      label: m[0],
    }));
    const incoming = [...newCitations, ...newTickets];
    if (incoming.length === 0) return;
    setArtifacts((prev) => {
      const existingLabels = new Set(prev.map((a) => a.label));
      return [...prev, ...incoming.filter((a) => !existingLabels.has(a.label))];
    });
  }

  async function send(textOverride?: string) {
    const value = (textOverride ?? input).trim();
    if (!value || loading || hitl) return;
    const userMsg: Msg = { role: "user", content: value };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setStreaming(true);

    let accumulated = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: threadId.current,
          message: userMsg.content,
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        // v1.8 saga 自愈: 409 escalate_in_progress 用 detail 显示友好提示
        let detail = errText.slice(0, 200);
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error === "escalate_in_progress" && errJson.detail) {
            detail = errJson.detail;
          }
        } catch {
          // not JSON, fall back to raw text
        }
        appendAssistantToken(`[error] ${detail}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.mode === "messages") {
              const text = event.payload?.text ?? "";
              if (text) {
                accumulated += text;
                appendAssistantToken(text);
              }
            } else if (event.mode === "updates") {
              if (event.payload?.currentStep) setStep(event.payload.currentStep);
              if (event.payload?.interrupted && event.payload?.interrupt) {
                handleResponse({
                  interrupted: true,
                  interrupt: event.payload.interrupt,
                });
              }
            } else if (event.mode === "final") {
              if (event.payload?.currentStep) setStep(event.payload.currentStep);
            } else if (event.mode === "error") {
              appendAssistantToken(
                `\n\n[error] ${event.payload?.message ?? "stream failed"}`,
              );
            }
          } catch {
            // ignore parse errors on partial lines
          }
        }
      }
      if (accumulated) extractArtifactsFromText(accumulated);
    } catch (e) {
      appendAssistantToken(
        `\n\n[error] ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  async function openPreview() {
    setEscalating(true);
    try {
      const res = await fetch(
        `/api/escalate-preview?session_id=${threadId.current}`,
      );
      let data: { draft?: EscalateDraft; error?: string; detail?: string };
      try {
        data = await res.json();
      } catch {
        appendAssistantToken(`[error] 转人工预览响应解析失败 (HTTP ${res.status})`);
        return;
      }
      if (res.status === 409 || data.error === "escalate_in_progress") {
        appendAssistantToken(`[error] ${data.detail ?? "上次升级未完成,请重试"}`);
        return;
      }
      if (!data.draft) {
        appendAssistantToken(`[error] ${data.detail ?? "无法获取升级预览"}`);
        return;
      }
      // Preserve any existing key so a failed-then-retried escalate hits the same ticket file.
      setIdempotencyKey((prev) => prev ?? crypto.randomUUID());
      setPreviewDraft(data.draft);
    } catch (e) {
      appendAssistantToken(
        `[error] 转人工预览请求失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setEscalating(false);
    }
  }

  async function confirmEscalate({ user_note }: { user_note?: string }) {
    setPreviewDraft(null);
    setEscalating(true);
    setLoading(true);
    // Key is held across the entire escalate intent. Don't clear it on parse/network failure —
    // the user's retry must hit the same server-side ticket file.
    const keyForThisRequest = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(keyForThisRequest);
    try {
      const res = await fetch("/api/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: threadId.current,
          user_note,
          idempotency_key: keyForThisRequest,
        }),
      });
      let data: {
        ticket_id?: string;
        new_session_id?: string;
        currentStep?: string;
        reply?: string;
        interrupted?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interrupt?: any;
        error?: string;
        detail?: string;
      };
      try {
        data = await res.json();
      } catch {
        appendAssistantToken(
          `[error] 转人工响应解析失败 (HTTP ${res.status}). idempotency_key 已保留,可点击转人工重试同 ticket。`,
        );
        return;
      }
      if (!res.ok) {
        appendAssistantToken(`[error] ${data.detail ?? data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      handleResponse(data);
      if (data.new_session_id) {
        threadId.current = data.new_session_id;
        setStep("triage");
        setIdempotencyKey(null);
      } else if (data.ticket_id) {
        // Saga route always returns new_session_id on success. Force reload defends against
        // a server response shape change leaving the client on a stale, evidence-polluted thread.
        console.warn("[escalate] response missing new_session_id, force reload to avoid stale evidence");
        window.location.reload();
      }
    } catch (e) {
      appendAssistantToken(
        `[error] 转人工请求失败: ${e instanceof Error ? e.message : String(e)}. idempotency_key 已保留,重试不会重复 ticket。`,
      );
    } finally {
      setEscalating(false);
      setLoading(false);
    }
  }

  async function decide(decision: HITLDecision) {
    setHitl(null);
    setLoading(true);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: threadId.current, decision }),
      });
      const data = await res.json();
      handleResponse(data);
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-canvas">
      <main className="flex flex-col flex-1 min-w-0">
        {/* Top nav — sticky cream bar with wordmark + step pill + escalate */}
        <header className="
          flex items-center justify-between
          h-14 px-6 md:px-8
          border-b border-hairline-soft
          bg-canvas
        ">
          <div className="flex items-center gap-2.5">
            <span
              className="size-2 rounded-full bg-fin-orange"
              aria-hidden
            />
            <span className="text-[15px] font-medium text-ink tracking-tight">
              IT Helpdesk
            </span>
            <span className="text-[12px] text-ink-tertiary font-mono ml-1">
              / Fin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <StepPill step={step} />
            <EscalateButton
              onClickAction={openPreview}
              disabled={loading || escalating || step === "escalate_prep"}
            />
          </div>
        </header>

        {/* Conversation area */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto scroll-cream"
        >
          <div className="max-w-2xl mx-auto px-6 md:px-8 py-10">
            {isEmpty ? (
              <EmptyHero onPick={(s) => send(s)} disabled={loading} />
            ) : (
              <div className="space-y-6 pb-4">
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const showCursor = streaming && isLast && m.role === "assistant";
                  return <MessageRow key={i} message={m} showCursor={showCursor} />;
                })}
                {/* 仅当没有进行中的 assistant 消息时显示 ThinkingRow（首次 token 到达前的等待）*/}
                {loading && (!streaming || messages[messages.length - 1]?.role !== "assistant") && (
                  <ThinkingRow />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Composer — sticky bottom */}
        <div className="border-t border-hairline-soft bg-canvas">
          <div className="max-w-2xl mx-auto px-6 md:px-8 py-4">
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => send()}
              disabled={loading || escalating || !!hitl}
              hint={
                hitl
                  ? "等待你确认 Agent 的高风险动作…"
                  : escalating
                  ? "正在准备转人工包…"
                  : undefined
              }
            />
          </div>
        </div>

        {hitl && <HITLModal request={hitl} onDecideAction={decide} />}

        {previewDraft && (
          <EscalatePreviewModal
            draft={previewDraft}
            onConfirmAction={confirmEscalate}
            onCancelAction={() => setPreviewDraft(null)}
          />
        )}
      </main>

      <ArtifactSidebar artifacts={artifacts} />
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function StepPill({ step }: { step: string }) {
  const label = STEP_LABEL[step] ?? step;
  return (
    <span className="
      hidden sm:inline-flex items-center gap-1.5
      px-2.5 py-1 rounded-pill
      bg-surface-1 border border-hairline
      text-[12px] text-ink-muted
    ">
      <span className="text-ink-tertiary text-[11px] uppercase tracking-wider">
        Step
      </span>
      <span className="font-mono text-ink">{label}</span>
    </span>
  );
}

function EmptyHero({
  onPick,
  disabled,
}: {
  onPick: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="pt-6 pb-2 animate-rise-in">
      <div className="text-[12px] font-medium text-fin-orange uppercase tracking-wider mb-3">
        Fin · IT Agent
      </div>
      <h1 className="
        text-[40px] md:text-[48px] leading-[1.05] tracking-display-md
        font-medium text-ink
      ">
        哪里出了问题？
      </h1>
      <p className="text-[16px] text-ink-muted mt-3 leading-relaxed max-w-md">
        描述你的 IT 问题，Agent 会先检索内部知识、尝试自助排查；
        必要时转人工，并在执行高风险动作前征求你的同意。
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="
              group text-left
              px-4 py-3.5 rounded-lg
              bg-surface-1 border border-hairline-soft
              transition-colors duration-150
              hover:border-hairline hover:bg-surface-1
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <span className="block text-[14px] text-ink leading-snug">
              {s}
            </span>
            <span className="
              block mt-1.5 text-[11px] text-ink-tertiary uppercase tracking-wider
              group-hover:text-fin-orange transition-colors
            ">
              试试这个 →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  showCursor = false,
}: {
  message: Msg;
  /** 流式生成中的最后一条 assistant 消息，末尾追加打字光标 */
  showCursor?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="
          max-w-[85%] px-4 py-2.5 rounded-lg
          bg-ink text-on-primary
          text-[15px] leading-relaxed
          whitespace-pre-wrap break-words
        ">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant: white card on cream + Fin-orange left stripe + avatar dot
  return (
    <div className="flex gap-3 items-start animate-rise-in">
      <span
        className="
          mt-0.5 size-7 rounded-full bg-ink shrink-0
          flex items-center justify-center
          text-on-primary text-[11px] font-medium tracking-tight
          ring-2 ring-fin-orange ring-offset-2 ring-offset-canvas
        "
        aria-hidden
        title="Fin Agent"
      >
        F
      </span>
      <div className="
        relative flex-1 min-w-0
        bg-surface-1 border border-hairline-soft rounded-lg
        px-5 py-3.5
        text-[15px] text-ink leading-relaxed
        whitespace-pre-wrap break-words
      ">
        <span
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-fin-orange/70"
          aria-hidden
        />
        {message.content || (
          <span className="text-ink-tertiary italic">…</span>
        )}
        {showCursor && (
          <span
            className="inline-block w-[2px] h-[1.1em] align-text-bottom ml-[1px] bg-ink animate-pulse"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="flex gap-3 items-center">
      <span className="size-7 rounded-full bg-ink shrink-0 flex items-center justify-center text-on-primary text-[11px] font-medium ring-2 ring-fin-orange ring-offset-2 ring-offset-canvas">
        F
      </span>
      <div className="flex items-center gap-1.5 px-4 py-3 bg-surface-1 border border-hairline-soft rounded-lg">
        <span
          className="size-1.5 rounded-full bg-ink-tertiary animate-pulse-soft"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="size-1.5 rounded-full bg-ink-tertiary animate-pulse-soft"
          style={{ animationDelay: "200ms" }}
        />
        <span
          className="size-1.5 rounded-full bg-ink-tertiary animate-pulse-soft"
          style={{ animationDelay: "400ms" }}
        />
        <span className="ml-2 text-[12px] text-ink-tertiary">思考中</span>
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div
        className={`
          flex items-end gap-2 p-2 rounded-xl
          bg-surface-1 border
          transition-colors
          ${disabled ? "border-hairline-soft" : "border-hairline focus-within:border-ink/60"}
        `}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="描述你的 IT 问题…  (Enter 发送 · Shift+Enter 换行)"
          disabled={disabled}
          rows={1}
          className="
            flex-1 min-w-0 resize-none
            bg-transparent
            px-3 py-2.5 max-h-40
            text-[15px] text-ink placeholder:text-ink-tertiary
            outline-none
            disabled:opacity-50
          "
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="
            shrink-0 inline-flex items-center gap-1.5
            px-4 py-2.5 rounded-md
            bg-ink text-on-primary
            text-[14px] font-medium tracking-tight
            transition-colors
            hover:bg-inverse-canvas
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink
          "
          aria-label="发送"
        >
          发送
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M2.5 7h9M8 3.5L11.5 7 8 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[11px] text-ink-tertiary">
          {hint ?? "Agent 在执行高风险操作前会请求你的批准。"}
        </span>
      </div>
    </div>
  );
}
