#!/usr/bin/env tsx
/**
 * Eval runner（v2 — evaluator 模式）
 *
 * 职责：
 *   1. load scenarios.yaml
 *   2. 对每个 scenario 调 runAgent → RunOutput
 *   3. 把 RunOutput 喂给所有 applicable evaluators
 *   4. 汇总成 markdown 报告
 *
 * 不做：单个评估的具体逻辑（在 evaluators/）。
 *
 * 设计参考：LangSmith evaluate(run_function, evaluators=[...])。
 */

import "dotenv/config";
import nodeFs from "fs";
import path from "path";
import YAML from "yaml";
import { runAgent } from "./runAgent";
import { ALL_EVALUATORS, type Scenario, type EvaluatorResult } from "./evaluators";

type ScenarioReport = {
  id: string;
  category?: string;
  duration_ms?: number;
  results?: EvaluatorResult[];
  /** Pass-rate over applicable evaluators */
  passed?: number;
  applicable?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
  finalState?: unknown;
};

async function setup(s: Scenario): Promise<void> {
  if (s.setup?.create_draft_kb) {
    const dir = path.dirname(s.setup.create_draft_kb);
    nodeFs.mkdirSync(dir, { recursive: true });
    nodeFs.writeFileSync(
      s.setup.create_draft_kb,
      `---\ntitle: Test Draft\ncategory: incidents\nsymptoms: ["${s.user_input}"]\nseverity: P3\nlast_updated: 2026-05-05\n---\n\n## Symptoms\n${s.user_input} - keyword match\n`,
    );
  }
}

function teardown(s: Scenario): void {
  if (s.setup?.create_draft_kb && nodeFs.existsSync(s.setup.create_draft_kb)) {
    nodeFs.unlinkSync(s.setup.create_draft_kb);
  }
}

function shouldSkip(s: Scenario): string | null {
  if (s.trigger) return `trigger ${s.trigger} not yet handled in runner`;
  if (s.inject_tool_failure) {
    return `inject_tool_failure (${s.inject_tool_failure.tool}) not yet handled — manual hook needed`;
  }
  if (s.turns) return "multi-turn not yet handled in runner — single-turn baseline only";
  return null;
}

async function runScenario(s: Scenario): Promise<ScenarioReport> {
  const t0 = Date.now();
  try {
    await setup(s);
    const run = await runAgent(s);
    const applicable = ALL_EVALUATORS.filter((e) => e.applies(s));
    const results = await Promise.all(
      applicable.map((e) =>
        Promise.resolve(e.evaluate(run, s)).catch<EvaluatorResult>((err) => ({
          key: e.key,
          score: 0,
          comment: `evaluator threw: ${err instanceof Error ? err.message : String(err)}`,
        })),
      ),
    );
    const passed = results.filter((r) => r.score === 1).length;
    return {
      id: s.id,
      category: s.category,
      duration_ms: Date.now() - t0,
      results,
      passed,
      applicable: applicable.length,
      finalState: run.finalState,
    };
  } catch (e: unknown) {
    return {
      id: s.id,
      category: s.category,
      duration_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    teardown(s);
  }
}

function formatReport(reports: ScenarioReport[], date: string): string {
  const runnable = reports.filter((r) => !r.skipped);
  const totalApplicable = runnable.reduce((a, r) => a + (r.applicable ?? 0), 0);
  const totalPassed = runnable.reduce((a, r) => a + (r.passed ?? 0), 0);
  const fullPass = runnable.filter(
    (r) => (r.applicable ?? 0) > 0 && r.passed === r.applicable,
  ).length;

  const durations = runnable
    .filter((r) => typeof r.duration_ms === "number" && !r.error)
    .map((r) => r.duration_ms!)
    .sort((a, b) => a - b);
  const p50 = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const p95 = durations.length
    ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
    : 0;

  const byKey = new Map<string, { pass: number; total: number }>();
  for (const r of runnable) {
    for (const er of r.results ?? []) {
      const cur = byKey.get(er.key) ?? { pass: 0, total: 0 };
      cur.total += 1;
      if (er.score === 1) cur.pass += 1;
      byKey.set(er.key, cur);
    }
  }

  const lines: string[] = [];
  lines.push(`# Eval Report ${date}`);
  lines.push("");
  lines.push(`- Total: ${reports.length}`);
  lines.push(`- Skipped: ${reports.filter((r) => r.skipped).length}`);
  lines.push(`- Full-pass scenarios: ${fullPass}/${runnable.length}`);
  lines.push(`- Evaluator pass-rate (overall): ${totalPassed}/${totalApplicable}`);
  lines.push(`- Latency p50/p95: ${(p50 / 1000).toFixed(1)}s / ${(p95 / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push(`## Per-evaluator pass rate`);
  lines.push("");
  lines.push(`| Evaluator | Pass | Total |`);
  lines.push(`|---|---|---|`);
  for (const [k, v] of byKey) {
    lines.push(`| ${k} | ${v.pass} | ${v.total} |`);
  }
  lines.push("");
  lines.push(`## Per scenario`);
  lines.push("");
  for (const r of reports) {
    if (r.skipped) {
      lines.push(`### ${r.id}\n\nskipped: ${r.reason}\n`);
      continue;
    }
    if (r.error) {
      const dur =
        typeof r.duration_ms === "number" ? ` (${(r.duration_ms / 1000).toFixed(1)}s)` : "";
      lines.push(`### ${r.id}${dur}\n\nerror: ${r.error}\n`);
      continue;
    }
    const dur = ` (${(r.duration_ms! / 1000).toFixed(1)}s)`;
    const summary = `${r.passed}/${r.applicable}`;
    lines.push(`### ${r.id}${dur} — ${summary}`);
    lines.push("");
    const fs = r.finalState as {
      scenario?: string | null;
      related?: string[];
      currentStep?: string;
    };
    lines.push(
      `- final_state: scenario=${fs.scenario ?? "null"}, related=${JSON.stringify(fs.related ?? [])}, step=${fs.currentStep ?? "?"}`,
    );
    for (const er of r.results ?? []) {
      const mark = er.score === 1 ? "✅" : er.score === 0 ? "❌" : "·";
      lines.push(`- ${mark} **${er.key}** — ${er.comment}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const filterArg = process.argv.find((a) => a.startsWith("--scenario="));
  const filter = filterArg?.split("=")[1];
  const scenariosPath = path.join(process.cwd(), "eval", "scenarios.yaml");
  const scenarios: Scenario[] = YAML.parse(
    nodeFs.readFileSync(scenariosPath, "utf-8"),
  ) as Scenario[];
  const targets = filter ? scenarios.filter((s) => s.id === filter) : scenarios;

  const reports: ScenarioReport[] = [];
  for (const s of targets) {
    const skipReason = shouldSkip(s);
    if (skipReason) {
      reports.push({ id: s.id, category: s.category, skipped: true, reason: skipReason });
      continue;
    }
    console.log(`Running ${s.id}...`);
    reports.push(await runScenario(s));
  }

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join("eval", "reports", `${date}.md`);
  nodeFs.mkdirSync(path.dirname(reportPath), { recursive: true });
  nodeFs.writeFileSync(reportPath, formatReport(reports, date));

  const runnable = reports.filter((r) => !r.skipped);
  const totalApplicable = runnable.reduce((a, r) => a + (r.applicable ?? 0), 0);
  const totalPassed = runnable.reduce((a, r) => a + (r.passed ?? 0), 0);
  console.log(`Report written: ${reportPath}`);
  console.log(
    `Summary: ${totalPassed}/${totalApplicable} evaluator-passes across ${runnable.length} scenarios`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
