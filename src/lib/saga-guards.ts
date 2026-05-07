import type { RouteAgent } from "./agent-types";

/**
 * If the agent is mid-saga (`currentStep == "escalate_committing"`), return a
 * 409 telling the caller to retry escalate. The escalate route's recovery path
 * is the only safe way to advance from this state — chat / resume / preview
 * cannot finalize on the user's behalf.
 */
export async function rejectIfEscalateCommitting(
  agent: RouteAgent,
  config: object,
  sessionId: string,
): Promise<Response | null> {
  const state = await agent.getState(config);
  if (state?.values?.currentStep !== "escalate_committing") return null;
  return Response.json(
    {
      error: "escalate_in_progress",
      detail:
        "上次升级未完成。请再次点击转人工按钮重试 (saga recovery 用同 ticket_id 不重复创建工单),或刷新页面开新对话。",
      session_id: sessionId,
    },
    { status: 409 },
  );
}
