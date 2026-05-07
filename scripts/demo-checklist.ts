#!/usr/bin/env tsx
/**
 * Render eval/scenarios.yaml → DEMO_CHECKLIST.md
 * single source of truth: same scenarios drive eval runner / HTTP smoke / human demo.
 * Run: pnpm demo:checklist
 */
import fs from "fs";
import path from "path";
import YAML from "yaml";

interface Turn {
  user: string;
  expected_agent_intent?: string;
  expected_tool_calls?: string[];
}

interface Scenario {
  id: string;
  category: string;
  user_input?: string;
  turns?: Turn[];
  expected_action?: string;
  expected_why?: string[];
  must_cite_sources?: string[];
  must_not_cite?: string[];
  expected_parallel_tool_calls_in_diagnose?: number;
  expected_related?: string[];
  inject_tool_failure?: { tool: string; error: string };
  judge_criteria?: string[];
  demo_highlight?: string;
}

const ROOT = path.resolve(__dirname, "..");
const yamlPath = path.join(ROOT, "eval/scenarios.yaml");
const outPath = path.join(ROOT, "DEMO_CHECKLIST.md");

const raw = fs.readFileSync(yamlPath, "utf-8");
const scenarios = YAML.parse(raw) as Scenario[];

const lines: string[] = [
  "# Demo Checklist",
  "",
  `> Auto-generated from \`eval/scenarios.yaml\` (${scenarios.length} scenarios). Re-run \`pnpm demo:checklist\` after editing the YAML.`,
  "> Goal: walk these in a real browser before demo to catch UI/SSE bugs the agent-layer e2e tests can't see.",
  "",
  "**Setup**: `cp .env.example .env` → fill keys → `pnpm dev` → open http://localhost:3000",
  "",
  "---",
  "",
];

const byCategory = new Map<string, Scenario[]>();
for (const sc of scenarios) {
  if (!byCategory.has(sc.category)) byCategory.set(sc.category, []);
  byCategory.get(sc.category)!.push(sc);
}

for (const [cat, list] of byCategory) {
  lines.push(`## ${cat}`, "");
  for (const sc of list) {
    const heading = sc.demo_highlight
      ? `### ☐ \`${sc.id}\` ${sc.demo_highlight}`
      : `### ☐ \`${sc.id}\``;
    lines.push(heading, "");

    if (sc.turns && sc.turns.length > 0) {
      lines.push("**多轮对话** —");
      for (let i = 0; i < sc.turns.length; i++) {
        const t = sc.turns[i];
        lines.push(`- 第 ${i + 1} 轮 输入: \`${t.user}\``);
        if (t.expected_agent_intent) lines.push(`  - 期望 agent 行为: **${t.expected_agent_intent}**`);
        if (t.expected_tool_calls?.length) lines.push(`  - 期望工具调用: ${t.expected_tool_calls.map((x) => `\`${x}\``).join(", ")}`);
      }
    } else if (sc.user_input) {
      lines.push(`**输入**: \`${sc.user_input}\``);
    }
    lines.push("");

    if (sc.expected_action) lines.push(`- **期望 action**: \`${sc.expected_action}\``);
    if (sc.expected_why?.length) lines.push(`- **期望 why_escalating**: ${sc.expected_why.map((x) => `\`${x}\``).join(" / ")}`);
    if (sc.must_cite_sources?.length) {
      lines.push(`- **必须看到 inline citation**: ${sc.must_cite_sources.map((x) => `\`${x}\``).join(", ")}`);
    }
    if (sc.must_not_cite?.length) {
      lines.push(`- **❌ 禁忌引用（红鲱鱼）**: ${sc.must_not_cite.map((x) => `\`${x}\``).join(", ")}`);
    }
    if (sc.expected_parallel_tool_calls_in_diagnose) {
      lines.push(`- **期望 diagnose 并行工具数**: ≥ ${sc.expected_parallel_tool_calls_in_diagnose}（看 LangSmith trace 确认）`);
    }
    if (sc.expected_related?.length) {
      lines.push(`- **期望识别复合场景**: \`related: [${sc.expected_related.join(", ")}]\``);
    }
    if (sc.inject_tool_failure) {
      lines.push(`- **故意注入工具失败**: \`${sc.inject_tool_failure.tool}\` 抛 "${sc.inject_tool_failure.error}"，期望 agent 优雅降级`);
    }
    if (sc.judge_criteria?.length) {
      lines.push(`- **judge 准则**:`);
      for (const c of sc.judge_criteria) lines.push(`  - ${c}`);
    }
    lines.push("");
  }
}

lines.push("---", "");
lines.push("## 通用 UI 检查（每个场景都看一遍）", "");
lines.push("- [ ] ChatPanel 真实渲染 reply（不是 [object Object]）");
lines.push("- [ ] inline citation `[data/kb/...]` 真链接到 KB 文件名");
lines.push("- [ ] 高风险路径触发 HITLModal 弹出（不是 silently 写盘）");
lines.push("- [ ] HITLModal approve / reject 按钮都可点 + 状态返回 ChatPanel");
lines.push("- [ ] 🔴 转人工按钮始终可见（spec §1.2 安全出口承诺）");
lines.push("- [ ] EscalatePreviewModal 显示当前 evidence + 允许编辑 user_note");
lines.push("- [ ] 升级后 ArtifactSidebar 显示新 ticket + 引用文件链接");
lines.push("- [ ] 浏览器 console 无红色 error（hydration mismatch / SSE parse fail）");
lines.push("");

fs.writeFileSync(outPath, lines.join("\n"));
console.log(`✓ Generated ${outPath}`);
console.log(`  ${scenarios.length} scenarios across ${byCategory.size} categories`);
