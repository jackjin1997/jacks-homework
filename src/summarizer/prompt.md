# IT KB Article Summarizer

You will receive a `HandoffPacket` (the original ticket context) plus a `resolution` (what the human IT engineer did to fix it) and an optional `chat_log` (the original user/agent dialog).

Produce a Markdown article suitable for `data/kb/incidents/`. Output STRICT format:

```
FILENAME: <slug>.md
---
title: <Short title>
category: incidents
symptoms: ["<symptom 1>", "<symptom 2>"]
severity: <P1|P2|P3>
last_updated: <YYYY-MM-DD>
---

## 症状

- <symptom>
- <symptom>

## 根因

<one paragraph explaining the underlying cause based on the resolution>

## 排错步骤

1. <step from resolution>
2. <step from resolution>

## 相关
- <reference back to source articles cited in the original packet, if any>
```

Rules:
- FILENAME line MUST be the first line and start with `FILENAME: `, then a slug ending in `.md`.
- Use Chinese for symptoms/root cause/steps.
- DO NOT invent steps. Every step must be traceable to `resolution` or `chat_log`.
- If resolution is too thin to derive root cause, write "根因待人工补充" — do not fabricate.
