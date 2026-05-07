import fs from "fs";
import path from "path";
import YAML from "yaml";
import { DATA_DIR } from "@/lib/paths";

type UserRecord = {
  team: string;
  groups?: string[];
  manager?: string | null;
};

type AccessRule = {
  action: string;
  auto_approve_if?: string[] | "never";
};

type Policies = {
  access_rules?: AccessRule[];
};

export type AccessPolicyResult = {
  decision: "auto_approve_low_risk" | "manager_approval" | "deny";
  risk: "low" | "medium" | "high";
  reason: string;
  action: string;
  user_context: { team: string; groups: string[]; manager?: string | null } | null;
};

export function actionForGroup(group: string): string {
  return `grant_${group.replace(/-/g, "_")}`;
}

type PolicyData = {
  policies: Policies;
  users: Record<string, UserRecord>;
};

function parseQuotedList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim().match(/^"([^"]+)"$/)?.[1])
    .filter((item): item is string => Boolean(item));
}

function matchesUser(condition: string, user: UserRecord): boolean {
  const teamEquals = condition.match(/^user\.team\s*==\s*"([^"]+)"$/);
  if (teamEquals) return user.team === teamEquals[1];

  const teamIn = condition.match(/^user\.team\s+in\s+\[(.*)\]$/);
  if (teamIn) return parseQuotedList(teamIn[1]).includes(user.team);

  const groupHas = condition.match(/^user has "([^"]+)" in groups$/);
  if (groupHas) return (user.groups ?? []).includes(groupHas[1]);

  return false;
}

function loadPolicyData(): PolicyData {
  return {
    policies: YAML.parse(fs.readFileSync(path.join(DATA_DIR, "policies.yaml"), "utf-8")) as Policies,
    users: JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf-8")) as Record<string, UserRecord>,
  };
}

export function evaluateAccessPolicy(
  userId: string,
  action: string,
  data: PolicyData = loadPolicyData(),
): AccessPolicyResult {
  const { policies, users } = data;
  const user = users[userId];

  if (!user) {
    return {
      decision: "deny",
      risk: "high",
      reason: "user_not_found",
      action,
      user_context: null,
    };
  }

  const rule = (policies.access_rules ?? []).find((candidate) => candidate.action === action);
  const user_context = {
    team: user.team,
    groups: user.groups ?? [],
    manager: user.manager,
  };

  if (!rule) {
    return {
      decision: "manager_approval",
      risk: "medium",
      reason: "no_rule_defined; default-deny-with-approval",
      action,
      user_context,
    };
  }

  if (rule.auto_approve_if === "never") {
    return {
      decision: "manager_approval",
      risk: "high",
      reason: "rule says never auto-approve",
      action,
      user_context,
    };
  }

  const conditions = rule.auto_approve_if ?? [];
  if (conditions.some((condition) => matchesUser(condition, user))) {
    return {
      decision: "auto_approve_low_risk",
      risk: "low",
      reason: "matches auto_approve_if",
      action,
      user_context,
    };
  }

  return {
    decision: "manager_approval",
    risk: "medium",
    reason: "does not match auto_approve_if",
    action,
    user_context,
  };
}
