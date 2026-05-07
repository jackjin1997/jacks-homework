import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { TICKETS_OPEN } from "@/lib/paths";

/**
 * HTTP-level smoke tests — 真过 Next.js route handler stack（safeParse / resolveIdentity / Response shape）
 * 与 agent-layer e2e 的差异：这层包含 web stack（body parse / strict reject / SSE/JSON shape / multi-route flow）。
 * 不重复 LLM 决策测试（那是 eval/runner.ts + __tests__/e2e/* 的事）。
 */

const RUN_LLM_TESTS = process.env.RUN_LLM_TESTS === "1";
const HAS_KEY = RUN_LLM_TESTS && !!process.env.GOOGLE_API_KEY;

type NextReqInit = ConstructorParameters<typeof NextRequest>[1];
function makeReq(url: string, init: NextReqInit = {}): NextRequest {
  return new NextRequest(url, init);
}

describe("/api/chat route — strict body reject (no LLM)", () => {
  it("rejects body with forged userId field → 400 invalid_body", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const req = makeReq("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", userId: "attacker-001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("rejects body missing message field → 400", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const req = makeReq("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe.runIf(HAS_KEY)("HTTP flow: chat → escalate-preview → escalate (real LLM)", () => {
  let sessionId: string;
  const userId = "u-001";
  const userMessage = "我是 u-001，登不上 Okta，重置密码后仍然 401。";

  beforeAll(() => {
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
  });

  it("POST /api/chat — returns reply + UUID session_id, injects userId + lastUserMessage to state", async () => {
    const { _resetAgentSingleton } = await import("@/agent");
    _resetAgentSingleton();

    const { POST } = await import("@/app/api/chat/route");
    const req = makeReq(`http://localhost/api/chat?as=${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);

    // 修正 codex P2 #5: chat route 现在返回 NDJSON streaming,逐行 parse 而不是 res.json()
    // 累积 messages.text 拼最终 reply,从 meta event 拿 session_id (第一个 event)
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let accumulated = "";
    let metaSessionId = "";
    let finalCurrentStep = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.mode === "meta") metaSessionId = event.payload?.session_id ?? "";
        else if (event.mode === "messages") accumulated += event.payload?.text ?? "";
        else if (event.mode === "final") finalCurrentStep = event.payload?.currentStep ?? "";
        else if (event.mode === "error") throw new Error(`stream error: ${event.payload?.message}`);
      }
    }
    expect(metaSessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(accumulated.length).toBeGreaterThan(0);
    expect(finalCurrentStep).toBeTruthy();
    sessionId = metaSessionId;
  }, 120_000);

  it("GET /api/escalate-preview — reads state from prior chat, returns draft with user_question", async () => {
    expect(sessionId).toBeTruthy();
    const { GET } = await import("@/app/api/escalate-preview/route");
    const req = makeReq(`http://localhost/api/escalate-preview?as=${userId}&session_id=${sessionId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toBeTruthy();
    // user_question 应来自 chat route 注入的 lastUserMessage
    expect(body.draft.user_question).toContain("Okta");
  }, 60_000);

  it("POST /api/escalate — saga happy path: writes ticket, returns new_session_id, currentStep=triage, recovered=false", async () => {
    expect(sessionId).toBeTruthy();
    const before = fs.readdirSync(TICKETS_OPEN);

    const { POST } = await import("@/app/api/escalate/route");
    const req = makeReq(`http://localhost/api/escalate?as=${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const res = await POST(req);
    expect([200, 201]).toContain(res.status);
    const body = await res.json();

    // v1.8 saga 契约: response 必带 new_session_id + recovered=false (happy path)
    expect(body.new_session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.new_session_id).not.toBe(sessionId);
    expect(body.recovered).toBe(false);
    expect(body.currentStep).toBe("triage");
    expect(body.ticket_id).toMatch(/^T-/);

    const after = fs.readdirSync(TICKETS_OPEN);
    const newFiles = after.filter((f) => !before.includes(f));
    const ours = newFiles
      .map((f) => ({ f, ticket: JSON.parse(fs.readFileSync(path.join(TICKETS_OPEN, f), "utf-8")) }))
      .filter((x) => x.ticket.requester?.user_id === userId || x.ticket.escalated);
    expect(ours.length).toBeGreaterThan(0);

    for (const o of ours) fs.unlinkSync(path.join(TICKETS_OPEN, o.f));
  }, 120_000);
});

/**
 * v1.8 saga state-machine tests — 不依赖 LLM token (只测 state transitions / 自愈 / recovery)。
 * 用 buildAgent 直接 setup state, 跳过 chat → preview 链路。
 */
describe("v1.8 saga: state-machine transitions (no LLM tokens)", () => {
  const userId = "u-001";

  beforeAll(() => {
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
  });

  it("/api/chat 自愈: currentStep == escalate_committing → 409 escalate_in_progress", async () => {
    const { _resetAgentSingleton, buildAgent } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const threadId = `${userId}:${sessionId}`;
    const config = { configurable: { thread_id: threadId } };
    const agent = buildAgent(() => userId);
    // setup: state 卡在 saga 中间
    await (agent as { updateState: (cfg: object, vals: object) => Promise<void> }).updateState(
      config,
      {
        userId,
        currentStep: "escalate_committing",
        editedPacket: {
          user_question: "stuck mid-saga",
          evidence_collected: [],
          steps_attempted: [],
          why_escalating: "user_requested",
          suggested_next_action: "retry escalate",
          confidence: "low",
        },
      },
    );

    const { POST } = await import("@/app/api/chat/route");
    const req = makeReq(`http://localhost/api/chat?as=${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: "新问题" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("escalate_in_progress");
    expect(body.detail).toContain("升级");
  }, 30_000);

  it("/api/escalate recovery: currentStep == escalate_committing + editedPacket + pendingTicketId → 复用 packet 和 ticket_id, recovered=true, 复用 ticket 文件 (helper fs.existsSync)", async () => {
    const { _resetAgentSingleton, buildAgent } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const threadId = `${userId}:${sessionId}`;
    const config = { configurable: { thread_id: threadId } };
    const agent = buildAgent(() => userId);

    const editedPacket = {
      user_question: "原始升级请求 (上次 Step 4 失败)",
      evidence_collected: [],
      steps_attempted: [],
      why_escalating: "user_requested" as const,
      suggested_next_action: "human review",
      confidence: "low" as const,
    };
    // 模拟上次 saga Step 3 commit lock 后 Step 4 写 ticket 失败 (但 ticket 实际已落盘)
    const pendingTicketId = `T-${crypto.randomUUID()}`;
    await (agent as { updateState: (cfg: object, vals: object) => Promise<void> }).updateState(
      config,
      { userId, currentStep: "escalate_committing", editedPacket, pendingTicketId },
    );
    // 预先放一份 ticket 模拟 Step 4 写成功但 Step 5 没跑
    fs.writeFileSync(
      path.join(TICKETS_OPEN, `${pendingTicketId}.json`),
      JSON.stringify({ id: pendingTicketId, packet: editedPacket, escalated: true, user_requested: true }, null, 2),
    );

    const { POST } = await import("@/app/api/escalate/route");
    const req = makeReq(`http://localhost/api/escalate?as=${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.recovered).toBe(true);
    expect(body.ticket_id).toBe(pendingTicketId);     // recovery 复用 same id
    expect(body.reused).toBe(true);                    // helper fs.existsSync 命中
    expect(body.new_session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.currentStep).toBe("triage");

    // 文件只 1 份 (没有第二个 ticket 被写出)
    const matchingFiles = fs.readdirSync(TICKETS_OPEN).filter((f) => f === `${pendingTicketId}.json`);
    expect(matchingFiles.length).toBe(1);

    fs.unlinkSync(path.join(TICKETS_OPEN, `${pendingTicketId}.json`));
  }, 30_000);

  it("/api/escalate corrupt state: currentStep == escalate_committing 缺 editedPacket 或 pendingTicketId → 500 saga_corrupt_state", async () => {
    const { _resetAgentSingleton, buildAgent } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const threadId = `${userId}:${sessionId}`;
    const config = { configurable: { thread_id: threadId } };
    const agent = buildAgent(() => userId);
    await (agent as { updateState: (cfg: object, vals: object) => Promise<void> }).updateState(
      config,
      { userId, currentStep: "escalate_committing", editedPacket: null, pendingTicketId: null },
    );

    const { POST } = await import("@/app/api/escalate/route");
    const req = makeReq(`http://localhost/api/escalate?as=${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("saga_corrupt_state");
  }, 30_000);

  it("v1.8.1 idempotency: writeEscalationTicket helper 同 ticket_id 第二次调用 reused=true 不重写", async () => {
    const { writeEscalationTicket } = await import("@/agent/tools/escalate_user_requested");
    const ticketId = `T-test-${crypto.randomUUID()}`;
    const packet = {
      user_question: "test idempotency helper",
      evidence_collected: [],
      steps_attempted: [],
      why_escalating: "user_requested" as const,
      suggested_next_action: "human review",
      confidence: "low" as const,
    };
    const first = await writeEscalationTicket(packet, ticketId);
    expect(first.ticket_id).toBe(ticketId);
    expect(first.reused).toBe(false);

    // 第二次同 id → reused=true, 不重写
    const second = await writeEscalationTicket(packet, ticketId);
    expect(second.ticket_id).toBe(ticketId);
    expect(second.reused).toBe(true);
    expect(second.file).toBe(first.file);

    // 文件系统只 1 份
    expect(fs.readdirSync(TICKETS_OPEN).filter((f) => f === `${ticketId}.json`).length).toBe(1);

    fs.unlinkSync(path.join(TICKETS_OPEN, `${ticketId}.json`));
  });

  it("v1.8.2 idempotency_key: 同 client key 两次 POST → same ticket_id, file 只 1 份, 第二次 reused=true", async () => {
    const { _resetAgentSingleton } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const expectedTicketId = `T-cli-${idempotencyKey}`;

    const { POST } = await import("@/app/api/escalate/route");
    const makeReqWithKey = () =>
      makeReq(`http://localhost/api/escalate?as=${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, idempotency_key: idempotencyKey }),
      });

    const res1 = await POST(makeReqWithKey());
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.ticket_id).toBe(expectedTicketId);
    expect(body1.reused).toBe(false);

    // 第二次 POST 同 key (模拟用户网络抖动 / finalize-后双击)
    const res2 = await POST(makeReqWithKey());
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.ticket_id).toBe(expectedTicketId);   // same id
    expect(body2.reused).toBe(true);                   // helper fs.existsSync + read-validate 命中

    // fs 只 1 份 ticket
    const matchingFiles = fs.readdirSync(TICKETS_OPEN).filter((f) => f === `${expectedTicketId}.json`);
    expect(matchingFiles.length).toBe(1);

    fs.unlinkSync(path.join(TICKETS_OPEN, `${expectedTicketId}.json`));
  }, 30_000);

  it("v1.8.3 read-validate strict: ticket 文件 packet={} (id 匹配但 packet schema 无效) 不被 reuse", async () => {
    const { writeEscalationTicket } = await import("@/agent/tools/escalate_user_requested");
    const ticketId = `T-test-shallow-${crypto.randomUUID()}`;
    const file = path.join(TICKETS_OPEN, `${ticketId}.json`);

    // 模拟一个 id/flags 都对但 packet 缺字段的破文件 (codex 第 6 轮 P1: shallow check 漏判)
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        id: ticketId,
        escalated: true,
        user_requested: true,
        packet: {},   // 空 packet — HandoffPacket schema 校验不过
      }),
    );

    const validPacket = {
      user_question: "valid retry",
      evidence_collected: [],
      steps_attempted: [],
      why_escalating: "user_requested" as const,
      suggested_next_action: "human review",
      confidence: "low" as const,
    };
    const result = await writeEscalationTicket(validPacket, ticketId);
    expect(result.reused).toBe(false);   // 严格 safeParse 拒绝空 packet → 重写

    // 文件被覆盖为 valid
    const written = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(written.packet.user_question).toBe("valid retry");

    fs.unlinkSync(file);
  });

  it("v1.8.2 atomic + read-validate: 旧 0-byte ticket 文件不被当 valid, 重写覆盖", async () => {
    const { writeEscalationTicket } = await import("@/agent/tools/escalate_user_requested");
    const ticketId = `T-test-corrupt-${crypto.randomUUID()}`;
    const file = path.join(TICKETS_OPEN, `${ticketId}.json`);

    // 模拟之前 partial write 留的 0-byte 文件
    fs.mkdirSync(TICKETS_OPEN, { recursive: true });
    fs.writeFileSync(file, "");
    expect(fs.statSync(file).size).toBe(0);

    const packet = {
      user_question: "test atomic write over corrupt",
      evidence_collected: [],
      steps_attempted: [],
      why_escalating: "user_requested" as const,
      suggested_next_action: "human review",
      confidence: "low" as const,
    };
    const result = await writeEscalationTicket(packet, ticketId);
    expect(result.ticket_id).toBe(ticketId);
    expect(result.reused).toBe(false);   // read-validate 拒绝 0-byte → 重写, 不 reuse

    // 文件现在是 valid JSON
    const written = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(written.id).toBe(ticketId);
    expect(written.escalated).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(0);

    fs.unlinkSync(file);
  });

  it("v1.8.2 preview 409: state 卡 escalate_committing 时 /api/escalate-preview 返 409", async () => {
    const { _resetAgentSingleton, buildAgent } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const threadId = `${userId}:${sessionId}`;
    const config = { configurable: { thread_id: threadId } };
    const agent = buildAgent(() => userId);
    await (agent as { updateState: (cfg: object, vals: object) => Promise<void> }).updateState(
      config,
      {
        userId,
        currentStep: "escalate_committing",
        editedPacket: {
          user_question: "stuck",
          evidence_collected: [],
          steps_attempted: [],
          why_escalating: "user_requested",
          suggested_next_action: "retry",
          confidence: "low",
        },
        pendingTicketId: `T-${crypto.randomUUID()}`,
      },
    );

    const { GET } = await import("@/app/api/escalate-preview/route");
    const req = makeReq(`http://localhost/api/escalate-preview?as=${userId}&session_id=${sessionId}`);
    const res = await GET(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("escalate_in_progress");
  }, 30_000);

  it("v1.8.2 双击 with idempotency_key: Promise.all 两个并发 same key → same ticket_id, file 1 份, 第二次 reused=true", async () => {
    const { _resetAgentSingleton } = await import("@/agent");
    _resetAgentSingleton();

    const sessionId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const expectedTicketId = `T-cli-${idempotencyKey}`;

    const { POST } = await import("@/app/api/escalate/route");
    const makeEscalateReq = () =>
      makeReq(`http://localhost/api/escalate?as=${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, idempotency_key: idempotencyKey }),
      });

    // Promise.all 两个并发 request — mutex 串行 + same idempotency key → 完全 idempotent
    const [res1, res2] = await Promise.all([POST(makeEscalateReq()), POST(makeEscalateReq())]);
    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);
    const body1 = await res1.json();
    const body2 = await res2.json();

    // v1.8.2 关键断言: 双击 same key 永远 same ticket_id, 不重复 ticket
    expect(body1.ticket_id).toBe(expectedTicketId);
    expect(body2.ticket_id).toBe(expectedTicketId);
    // 一个 reused=false (第一个落盘), 一个 reused=true (helper fs.existsSync + read-validate 命中)
    expect([body1.reused, body2.reused].sort()).toEqual([false, true]);

    // 文件系统只 1 份
    const matching = fs.readdirSync(TICKETS_OPEN).filter((f) => f === `${expectedTicketId}.json`);
    expect(matching.length).toBe(1);

    fs.unlinkSync(path.join(TICKETS_OPEN, `${expectedTicketId}.json`));
  }, 30_000);
});

describe("/api/escalate-preview — strict input (no LLM)", () => {
  it("rejects missing session_id → 400", async () => {
    const { GET } = await import("@/app/api/escalate-preview/route");
    const req = makeReq("http://localhost/api/escalate-preview?as=u-001");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("rejects malformed (non-UUID) session_id → 400", async () => {
    const { GET } = await import("@/app/api/escalate-preview/route");
    const req = makeReq("http://localhost/api/escalate-preview?as=u-001&session_id=other-user:UUID");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
