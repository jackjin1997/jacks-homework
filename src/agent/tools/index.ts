import { makeSearchKbTool } from "./search_kb";
import { makeGetUserTool } from "./get_user";
import { makeGetSystemStatusTool } from "./get_system_status";
import { makeCheckPolicyTool } from "./check_policy";
import { advanceToStepTool } from "./advance_to_step";
import { createTicketTool } from "./create_ticket";
import { escalateTool } from "./escalate";
import { escalateUserRequestedTool } from "./escalate_user_requested";
import { makeAutoGrantAccessTool } from "./auto_grant_access";
import { makeRequestAccessApprovalTool } from "./request_access_approval";

export function buildDataTools(getUserId: () => string) {
  return [
    makeSearchKbTool(),
    makeGetUserTool(getUserId),
    makeGetSystemStatusTool(),
    makeCheckPolicyTool(getUserId),
  ];
}

export function buildActTools(getUserId: () => string) {
  return [
    createTicketTool,
    escalateTool,                                    // agent 主动 (HITL on)
    escalateUserRequestedTool,                       // 用户主动 (HITL off, escalate_prep 专属)
    makeAutoGrantAccessTool(getUserId),              // 低风险自动批 (HITL off)
    makeRequestAccessApprovalTool(getUserId),        // 高风险审批 (HITL on)
  ];
}

export function buildAllTools(getUserId: () => string) {
  return [
    ...buildDataTools(getUserId),
    ...buildActTools(getUserId),
    advanceToStepTool,
  ];
}
