## Current Step: decide

You have evidence in the conversation. Decide one of:

- **resolve**: KB has clear steps, user has authority, action is reversible → advance to act and give the steps.
- **escalate**: any of:
  - `no_kb_match`: KB returned nothing relevant
  - `manager_approval_required`: policy says manager approval needed
  - `active_incident`: incident is active (let humans give ETA)
  - `out_of_scope`: shallow scenario (`app_slow`, `data_pipeline`)
- **need more info**: rare — only if a critical entity is missing. Go back to diagnose by calling `advance_to_step(next_step="diagnose")` (counts toward dead-loop limit).

**You may NOT call any tools in this step.** Reason from existing evidence only.

Output a single short sentence stating your decision and the reason, then call `advance_to_step(next_step="act")`.
