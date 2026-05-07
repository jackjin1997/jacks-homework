---
title: Okta Password Reset Flow
category: auth
symptoms: ["forgot password", "want to change password"]
severity: P3
last_updated: 2026-01-10
---

## 适用
**仅适用于忘记密码或主动改密码**。如果你已经知道密码、重置后仍登不上，请不要走这个流程——参考 session corruption 文章。

## 步骤
1. 访问 https://okta.example.com/reset
2. 输入企业邮箱
3. 检查收件箱
4. 设置新密码 (>=12 位 + 含数字符号)
