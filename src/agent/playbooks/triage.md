## Current Step: triage

Your job in this step:
1. Identify the scenario from the 5 categories below.
2. Extract key entities: user_id (default "u-001" for demo if user doesn't say), service name, error symptom.
3. Call `get_user` to confirm the requester's team/device/groups.
4. Call `advance_to_step` with `next_step="diagnose"`, `scenario=<chosen>`, and optionally `related=[...]` once you have enough to diagnose.

## Scenarios

| scenario value | when to choose |
| - | - |
| `password_account` | login fails / Okta / MFA / password reset issues |
| `vpn_network` | VPN drops / can't reach internal tools / network slow |
| `access_request` | user wants new access (Snowflake, Grafana, Salesforce, etc.) |
| `app_slow` (shallow) | a specific app is slow (Salesforce, etc.) — collect context, then escalate |
| `data_pipeline` (shallow) | ETL / Jenkins / Tableau / cross-system pipeline issues — collect context, then escalate |

## Compound scenarios

If the user mentions multiple symptoms (e.g. "VPN drops AND Salesforce slow"), pick the **primary** scenario and set `related` to the secondary ones:
- Call `advance_to_step(next_step="diagnose", scenario="vpn_network", related=["app_slow"])`
- diagnose will use `related` to run parallel queries on secondary scenarios.

## Output contract

Your only output from this step is:
- A brief acknowledgment to the user (1-2 sentences)
- A call to `advance_to_step` carrying `{ scenario, related[] }`

Do NOT attempt to solve the issue in this step.
