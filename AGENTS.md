<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:spec-plan-edit-discipline (v2 2026-05-05：v1 被注释字符串骗过 gate，本版升级) -->
# Spec / Plan 大改自检（5 步 gate v2）

每次 spec / plan / 设计文档发生 ≥ 50 行的改动，**在 commit 前 + 在汇报"完成"前**，强制按顺序跑这 5 步自检，任一步 fail 都不得说"完成"。**v1 教训：grep `export const X` 命中注释里的字符串草图，gate 形同虚设——v2 全部用 anchored 正则 + 真编译校验**。

1. **Schema/标识符 anchored grep**（v1 失效原因：注释里的 `// export const X` 也命中）
   - 用 `rg '^\s*export (const|function|type) X\b'`：**行首允许缩进**（spec 代码块在列表里有 3 空格缩进） + **`export` 词首** + 词尾边界
   - 注释行以 `//` 开头，缩进后变 `\s*//` 不匹配 `\s*export` ⇒ 注释字符串骗不过这条
   - **同时 grep 同名重复定义**：`rg -c '^\s*(export )?(const|function) X\s*[=(]'`，若 ≥ 2 ⇒ redeclare 风险
   - 例：`rg '^\s*export const HelpdeskStateSchema' spec.md` 必须 ≥ 1 且 ≤ 1（type alias `export type` 单独算）
2. **跨段指针有效** — 所有 "见上方 / 见 §X / 详见 lib/Y / 参照下方 ..." 的指针，目标必须 grep 到（保留）
3. **代码块 import 与目录树一致** — 所有 `import { ... } from "@/path"` 的 path 与 §11 / 目录结构段 cross-reference；**且每个 import 的标识符必须在 spec 里有 anchored grep 命中的真实定义**（不是注释草图）；新引入的 lib/ 文件必须同步加进目录树
4. **占位符当 P0 处理** — `z.lazy(() => UndefinedRef)` / "假设导出 X" / "前向声明" / "TBD" / "见下文" 但下文不存在 / **注释里的'草图代码'**（如 `// export const Foo = ...`）但没真实代码块 — 全部当 P0
5. **Copy-paste-ready 静态校验**（v1 失效原因：仅"看着对就行"，未跑编译）
   - 把 spec 里所有 ts 代码块连成一个虚拟工程：`cat <<EOF > /tmp/spec-snippets.ts ... EOF` + `npx tsc --noEmit /tmp/spec-snippets.ts`（或最少跑 prettier --check 验证语法）
   - 必查：无重复 `await req.json()` / 无 `z.lazy(() => Undefined)` / 无 `import X` 同时本文件 `function X` / 无把 zod schema 直接当 TS type（应 `import type` 或 `z.infer<typeof X>`）

汇报"完成"前必须显式跑完 5 步并**把每步的实际命令 + 输出摘要**写进汇报（不是凭印象写"X 命中"）。所有"X 次/X 处/X 字段"具体数字必须 `rg -c` 真跑过得出，不能凭印象。

**任何"5-step gate passed" 标签必须配 grep / tsc 实际命令证据，否则 codex review 会戳穿（已发生 1 次 — v1.5 commit 711acac）。**
<!-- END:spec-plan-edit-discipline -->
