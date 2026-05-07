import { describe, expect, it } from "vitest";
import { evaluateAccessPolicy, actionForGroup } from "@/lib/access_policy";

const policyData = {
  policies: {
    access_rules: [
      {
        action: "grant_snowflake_prod_readonly",
        auto_approve_if: [
          'user.team == "data-engineering"',
          'user has "snowflake-dev" in groups',
        ],
      },
      {
        action: "grant_snowflake_prod_admin",
        auto_approve_if: "never" as const,
      },
      {
        action: "grant_grafana_readonly",
        auto_approve_if: ['user.team in ["data-engineering", "product", "sre"]'],
      },
    ],
  },
  users: {
    "u-data": { team: "data-engineering", groups: [], manager: "u-manager" },
    "u-marketing": { team: "marketing", groups: [], manager: "u-manager" },
    "u-snowflake-dev": { team: "marketing", groups: ["snowflake-dev"], manager: "u-manager" },
    "u-substring": { team: "data", groups: ["snowflake"], manager: "u-manager" },
  },
};

describe("evaluateAccessPolicy", () => {
  it("denies unknown users", () => {
    const result = evaluateAccessPolicy("ghost-user", "grant_snowflake_prod_readonly", policyData);
    expect(result).toMatchObject({
      decision: "deny",
      risk: "high",
      reason: "user_not_found",
      user_context: null,
    });
  });

  it("defaults unknown actions to manager approval", () => {
    const result = evaluateAccessPolicy("u-data", "grant_unlisted_tool", policyData);
    expect(result).toMatchObject({
      decision: "manager_approval",
      risk: "medium",
      reason: "no_rule_defined; default-deny-with-approval",
    });
  });

  it("requires manager approval for never-auto-approve rules", () => {
    const result = evaluateAccessPolicy("u-data", "grant_snowflake_prod_admin", policyData);
    expect(result).toMatchObject({
      decision: "manager_approval",
      risk: "high",
      reason: "rule says never auto-approve",
    });
  });

  it("auto-approves exact team matches", () => {
    const result = evaluateAccessPolicy("u-data", "grant_grafana_readonly", policyData);
    expect(result).toMatchObject({
      decision: "auto_approve_low_risk",
      risk: "low",
      reason: "matches auto_approve_if",
    });
  });

  it("auto-approves exact group matches", () => {
    const result = evaluateAccessPolicy("u-snowflake-dev", "grant_snowflake_prod_readonly", policyData);
    expect(result).toMatchObject({
      decision: "auto_approve_low_risk",
      risk: "low",
      reason: "matches auto_approve_if",
    });
  });

  it("does not auto-approve substring team or group matches", () => {
    const result = evaluateAccessPolicy("u-substring", "grant_snowflake_prod_readonly", policyData);
    expect(result).toMatchObject({
      decision: "manager_approval",
      risk: "medium",
      reason: "does not match auto_approve_if",
    });
  });

  it("maps group names to policy actions", () => {
    expect(actionForGroup("snowflake-prod-readonly")).toBe("grant_snowflake_prod_readonly");
  });
});
