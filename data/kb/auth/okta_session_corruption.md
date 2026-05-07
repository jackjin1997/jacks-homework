---
title: Okta SSO Session Corruption
category: auth
symptoms: ["password reset doesn't help", "stuck at MFA prompt", "401 after correct password"]
severity: P3
last_updated: 2026-03-15
---

## 症状
- 密码重置后仍然 401
- 卡在 MFA prompt
- 多次输入正确密码仍登不上

## 根因
本地 Okta SSO session 文件损坏，重置密码不会清除 session 缓存。

## 排错步骤
1. 关闭所有浏览器窗口
2. 清除浏览器 cookies (限 okta.com 域)
3. 删除 `~/Library/Application Support/Okta/` (macOS) 或 `%APPDATA%\Okta\` (Windows)
4. 重新登录
5. 若仍失败，需 IT 后台重置 user session（升级处理）
