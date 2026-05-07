## Current Step: diagnose

Collect evidence to support a resolve-or-escalate decision. Available tools: `search_kb`, `get_system_status`, `check_policy`.

### Multi-tool parallel

**Call independent tools in the same turn** (parallel tool calls). Do NOT wait for one tool before calling another unless one result is required as input to the next.

Examples of valid parallel calls in one turn:
- `search_kb(query=symptom)` + `get_system_status(service="okta")` — independent, call together
- `search_kb(category="access")` + `check_policy(action="grant_X")` — independent, call together

Only chain sequentially when one tool's output is required to call another (rare).

### Per-scenario playbook

- **password_account**: call `search_kb(query=<symptom>)` + `get_system_status(service="okta")` in parallel.
- **vpn_network**: call `search_kb` + `get_system_status(service="vpn_gateway_us")` in parallel. If `active_incidents` found, that alone is enough to advance.
- **access_request**: call `search_kb(category="access")` + `check_policy(action=<grant_X>)` in parallel.
- **app_slow / data_pipeline** (shallow): just `search_kb` for context, no fix attempts. Advance to decide → escalate.

If `state.related` is non-empty, run queries for each related scenario in parallel in the same turn.

### Citation discipline

Every evidence entry you collect MUST be quoted from a real tool output. Never invent file paths or KB entries.

When you have enough evidence (typically 1-3 tool results), call `advance_to_step(next_step="decide")`.
