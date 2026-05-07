---
title: Grafana Read-Only Access Request
category: access
symptoms: ["new team member needs grafana", "want grafana dashboards"]
severity: P3
last_updated: 2026-03-01
---

## 流程
1. Agent 调 `check_policy(action="grant_grafana_readonly")` (user_id server-side 注入) 拿 `{ decision, risk }`
2. **decision: auto_approve_low_risk**（用户在 data-engineering / product / sre 团队）-> 调 `auto_grant_access(group="grafana-readonly")`，无 HITL
3. **decision: manager_approval**（其他团队）-> 调 `request_access_approval(group="grafana-readonly", justification=...)` 触发 HITL
4. **decision: deny** -> escalate
