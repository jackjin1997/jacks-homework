# IT Helpdesk Agent — 设计决策工作笔记

> **状态**：brainstorming 进行中。本文档是工作笔记，最终 spec 会落到 `docs/superpowers/specs/2026-04-25-it-helpdesk-agent-design.md`。
> **更新时间**：2026-04-25

---

## 决策 1：场景范围

**选择**：2-3 个场景做深，剩余时间用于打磨其中 1 个到极致。

**取舍**：
- 不做"广而浅"（5 个场景每个都是 demo 级），那样体现不出多步推理和工具编排
- 不做"单点极致"，那样体现不出 agent 的判断边界
- 居中策略：足够覆盖"解决 vs 升级"边界讨论，且每个场景都能展示真实工具调用

**为什么这样选**：作业 rubric 明确"我们更关心 tradeoff 质量，不是 feature 数量" + "强提交：处理边界、有评估、坦诚说明 scope"。

---

## 决策 2：场景组合

**选择**：Combo X = 密码/账户问题 + 权限申请 + VPN/网络

**为什么这三个**：
- **密码/账户**：高频、有明确 KB 答案、能展示"先查用户状态再给步骤"的多步推理
- **权限申请**：天然的"解决 vs 升级"边界场景（policy 决定能否自动批），最能展示 agent 判断力
- **VPN/网络**：能演示"查系统状态 → 比对已知故障 → 给排错步骤 or 升级"的链路

**裁掉的**：
- Salesforce 慢 → 偏可观测性问题，工具链路和密码/VPN 重复
- 数据管道失败（Jenkins/Tableau）→ 跨系统复杂度高，时间不够做扎实

---

## 待确定（下一步要问）

- [ ] **技术栈**：候选有 Raw Anthropic SDK / Claude Agent SDK / LangGraph / DeepAgents；当前最近一次推荐是 Path 1（Raw + 自写抽象 + LangSmith），但**用户尚未确认**
- [ ] **Mock 数据策略**：5 个数据源选哪几个、用什么格式（Markdown/JSON/YAML）、合成数据多丰富
- [ ] **Eval 策略**：scenarios.yaml + LLM-as-judge？是否用 LangSmith dataset？
- [ ] **Demo 形式**：纯 CLI 够不够，还是加个简单 Web UI
- [ ] **API key 准备**：Anthropic key、LangSmith key 是否可用

---

## 不变约束（来自作业要求）

- 必须本地可跑
- 至少 mock 2-3 个数据源，要"丰富到能展示多源推理"
- 必须有评估方法（不是手动跑几个 case）
- README 必须覆盖：问题选择、为什么需要 agentic、架构决策、解决/升级边界、数据源、假设/取舍、运行说明、评估方法、改进项
- Demo 时面试官会现场输新问题
