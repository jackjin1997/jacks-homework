/**
 * Evaluator unit tests — 用 mock RunOutput 验证每个 evaluator 的判定逻辑。
 *
 * 这些测试不依赖 LLM / 不调 agent，是纯单元测试。Goal：把 evaluator 当成
 * pure function 锁住语义；以后 agent 行为变了 evaluator 还能保持稳定参考。
 */

import { describe, it, expect } from "vitest";
import { groundingEvaluator } from "@/../eval/evaluators/grounding";
import { scenarioEvaluator } from "@/../eval/evaluators/scenario";
import { relatedEvaluator } from "@/../eval/evaluators/related";
import { actionEvaluator } from "@/../eval/evaluators/action";
import { whyEvaluator } from "@/../eval/evaluators/why";
import { parallelToolsEvaluator } from "@/../eval/evaluators/parallelTools";
import type { RunOutput, Scenario } from "@/../eval/evaluators/types";

function mkRun(over: Partial<RunOutput> = {}): RunOutput {
  return {
    finalState: { currentStep: "act", scenario: null, related: [] },
    toolCalls: [],
    text: "",
    textTail: "",
    ...over,
  };
}

describe("groundingEvaluator", () => {
  it("passes when must_cite present and no must_not_cite", () => {
    const s: Scenario = {
      id: "x",
      must_cite_sources: ["data/users.json"],
      must_not_cite: [],
    };
    const r = mkRun({ text: "see data/users.json for details" });
    const out = groundingEvaluator.evaluate(r, s);
    expect(out).toMatchObject({ key: "grounding", score: 1 });
  });

  it("fails when must_not_cite is cited", () => {
    const s: Scenario = {
      id: "x",
      must_cite_sources: [],
      must_not_cite: ["data/kb/auth/okta_password_red_herring.md"],
    };
    const r = mkRun({ text: "see data/kb/auth/okta_password_red_herring.md" });
    const out = groundingEvaluator.evaluate(r, s) as { score: number };
    expect(out.score).toBe(0);
  });
});

describe("scenarioEvaluator", () => {
  it("matches exact", () => {
    const s: Scenario = { id: "x", expected_scenario: "vpn_network" };
    const r = mkRun({ finalState: { scenario: "vpn_network" } });
    expect(scenarioEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("fails on mismatch", () => {
    const s: Scenario = { id: "x", expected_scenario: "vpn_network" };
    const r = mkRun({ finalState: { scenario: "password_account" } });
    expect((scenarioEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
});

describe("relatedEvaluator", () => {
  it("passes when expected ⊆ actual", () => {
    const s: Scenario = { id: "x", expected_related: ["app_slow"] };
    const r = mkRun({ finalState: { related: ["app_slow", "extra_one"] } });
    expect(relatedEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("fails when missing expected", () => {
    const s: Scenario = { id: "x", expected_related: ["app_slow", "vpn_network"] };
    const r = mkRun({ finalState: { related: ["app_slow"] } });
    expect((relatedEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
});

describe("actionEvaluator", () => {
  it("escalate passes when escalate tool called", () => {
    const s: Scenario = { id: "x", expected_action: "escalate" };
    const r = mkRun({
      toolCalls: [{ name: "escalate", args: {}, messageIndex: 0 }],
    });
    expect(actionEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("escalate fails when no escalate tool called", () => {
    const s: Scenario = { id: "x", expected_action: "escalate" };
    const r = mkRun({
      toolCalls: [{ name: "search_kb", args: {}, messageIndex: 0 }],
    });
    expect((actionEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
  it("act_resolve_or_escalate passes on final_step=act", () => {
    const s: Scenario = { id: "x", expected_action: "act_resolve_or_escalate" };
    const r = mkRun({ finalState: { currentStep: "act" } });
    expect(actionEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("flags unrecognized expected_action", () => {
    const s: Scenario = { id: "x", expected_action: "ask_clarifying_question" };
    const r = mkRun();
    const out = actionEvaluator.evaluate(r, s) as { score: number; comment: string };
    expect(out.score).toBe(0);
    expect(out.comment).toMatch(/unrecognized/);
  });
});

describe("whyEvaluator", () => {
  it("passes when escalate args.why_escalating ∈ expected_why", () => {
    const s: Scenario = { id: "x", expected_why: ["active_incident"] };
    const r = mkRun({
      toolCalls: [{ name: "escalate", args: { why_escalating: "active_incident" }, messageIndex: 0 }],
    });
    expect(whyEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("fails when no escalate tool called", () => {
    const s: Scenario = { id: "x", expected_why: ["active_incident"] };
    const r = mkRun({ toolCalls: [] });
    expect((whyEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
  it("fails when why_escalating not in expected list", () => {
    const s: Scenario = { id: "x", expected_why: ["active_incident"] };
    const r = mkRun({
      toolCalls: [{ name: "escalate", args: { why_escalating: "out_of_scope" }, messageIndex: 0 }],
    });
    expect((whyEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
});

describe("parallelToolsEvaluator", () => {
  it("counts max batch by messageIndex", () => {
    const s: Scenario = { id: "x", expected_parallel_tool_calls_in_diagnose: 2 };
    // 3 tools share messageIndex=2 → batch 3
    const r = mkRun({
      toolCalls: [
        { name: "search_kb", args: {}, messageIndex: 2 },
        { name: "get_user", args: {}, messageIndex: 2 },
        { name: "get_system_status", args: {}, messageIndex: 2 },
        { name: "create_ticket", args: {}, messageIndex: 5 },
      ],
    });
    expect(parallelToolsEvaluator.evaluate(r, s)).toMatchObject({ score: 1 });
  });
  it("fails when batch size below expected", () => {
    const s: Scenario = { id: "x", expected_parallel_tool_calls_in_diagnose: 2 };
    const r = mkRun({
      toolCalls: [{ name: "search_kb", args: {}, messageIndex: 2 }],
    });
    expect((parallelToolsEvaluator.evaluate(r, s) as { score: number }).score).toBe(0);
  });
});

describe("applies()", () => {
  it("evaluators self-skip when their fields are absent", () => {
    const empty: Scenario = { id: "x" };
    expect(scenarioEvaluator.applies(empty)).toBe(false);
    expect(relatedEvaluator.applies(empty)).toBe(false);
    expect(actionEvaluator.applies(empty)).toBe(false);
    expect(whyEvaluator.applies(empty)).toBe(false);
    expect(parallelToolsEvaluator.applies(empty)).toBe(false);
    expect(groundingEvaluator.applies(empty)).toBe(false);
  });
});
