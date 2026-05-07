import "dotenv/config";
import { describe, it, expect } from "vitest";
import { verifyKBArticle } from "@/summarizer/verifier";

const baseInput = {
  handoff_packet: {
    user_question: "Okta logout loop after VPN restart",
    evidence_collected: [],
    steps_attempted: [],
    why_escalating: "no_kb_match" as const,
    suggested_next_action: "reset session",
    confidence: "medium" as const,
  },
  resolution:
    "Cleared local Okta cache directory at ~/Library/Application Support/Okta/ then user logged in successfully.",
};

const perfectMd = `---
title: Okta Logout Loop after VPN Restart
category: incidents
symptoms: ["repeated MFA prompts", "infinite logout"]
severity: P3
last_updated: 2026-05-04
---

## 症状
- 重启 VPN 后反复弹 MFA
- 永远登不上

## 根因
本地 Okta SSO session 缓存损坏。

## 排错步骤
1. 退出 Okta 客户端
2. 删除 \`~/Library/Application Support/Okta/\`
3. 重新登录
`;

const hasKey =
  process.env.RUN_LLM_TESTS === "1" &&
  (!!process.env.GOOGLE_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.OPENAI_API_KEY);

describe.runIf(hasKey)("verifier (cross-model)", () => {
  it("scores a complete article >= 4", async () => {
    const r = await verifyKBArticle(perfectMd, baseInput);
    expect(r.score).toBeGreaterThanOrEqual(4);
  }, 60_000);

  it("scores hallucinated step <= 2", async () => {
    const bad = perfectMd.replace(
      "3. 重新登录",
      "3. 重新登录\n4. 联系 NASA 重置卫星 (HALLUCINATION — not in resolution)",
    );
    const r = await verifyKBArticle(bad, baseInput);
    expect(r.score).toBeLessThanOrEqual(2);
    expect(r.issues).toContain("hallucinated_step");
  }, 60_000);

  it("scores missing root_cause <= 3", async () => {
    const stripped = perfectMd.replace(/## 根因[\s\S]*?(?=## 排错步骤)/, "");
    const r = await verifyKBArticle(stripped, baseInput);
    expect(r.score).toBeLessThanOrEqual(3);
  }, 60_000);

  // R6-JUDGE: LLM judge variance — retry 2x. Same threshold preserved (<= 2);
  // we accept LLM flakiness rather than weakening the assertion.
  it("scores format-broken (no frontmatter) <= 2", { retry: 2, timeout: 60_000 }, async () => {
    const broken = perfectMd.replace(/^---[\s\S]*?---\n\n/, "");
    const r = await verifyKBArticle(broken, baseInput);
    expect(r.score).toBeLessThanOrEqual(2);
    expect(r.issues).toContain("format_inconsistent");
  });

  it("scores resolution-contradicting <= 2", async () => {
    const contradict = perfectMd.replace(
      "删除 `~/Library/Application Support/Okta/`",
      "删除整个 macOS 用户目录 (DESTRUCTIVE — contradicts original resolution)",
    );
    const r = await verifyKBArticle(contradict, baseInput);
    expect(r.score).toBeLessThanOrEqual(2);
  }, 60_000);
});
