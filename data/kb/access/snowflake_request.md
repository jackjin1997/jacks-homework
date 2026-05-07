---
title: Snowflake Production Access Request
category: access
symptoms: ["new team member needs Snowflake", "data engineer onboarding"]
severity: P3
last_updated: 2026-02-10
---

## 适用场景
新加入数据工程团队的员工申请 Snowflake 生产数据访问。

## 流程
1. Agent 调 `check_policy(action="grant_snowflake_prod_readonly")`（user_id 由 server-side 注入）判断 risk + decision
2. **risk:low + decision: auto_approve_low_risk**（团队成员已有 dev 访问 + 团队匹配）→ 调 `auto_grant_access(group="snowflake-prod-readonly")`，无 HITL
3. **risk:medium/high + decision: manager_approval**（首次申请 / 跨团队 / 涉及 PII 表）→ 调 `request_access_approval(group="snowflake-prod-readonly", justification=...)` 触发 HITL manager 审批
4. **decision: deny** → 拒绝 + escalate 走人工解释
