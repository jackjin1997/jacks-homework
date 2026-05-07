---
title: VPN Gateway Intermittent Disconnect
category: network
symptoms: ["VPN disconnects every 10-15 min", "tunnel timeout", "internal tools 502"]
severity: P2
last_updated: 2026-04-20
---

## 症状
- VPN 每 10-15 分钟自动断开
- 内网工具间歇 502
- ping 内网域名超时

## 根因
通常由 VPN gateway 健康问题或本地 NAT/防火墙 keepalive 过短引起。

## 排错步骤
1. 先查 `data/system_status.json` 确认 VPN gateway 是否有 active incident
2. 若有 active incident，告知用户 ETA，建议升级到 IT
3. 若无 incident，本地排查：
   - 切换网络（公司 WiFi ↔ 手机热点）测试
   - 重启 VPN client
   - 检查防火墙 keepalive 设置
