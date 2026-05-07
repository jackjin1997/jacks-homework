import { describe, it, expect } from "vitest";
import { VerifierResult } from "@/contracts/verifier_result";

describe("VerifierResult", () => {
  it("accepts valid score 1-5", () => {
    for (const score of [1, 2, 3, 4, 5]) {
      expect(() => VerifierResult.parse({ score, feedback: "ok", issues: ["no_issues"] })).not.toThrow();
    }
  });

  it("rejects score out of 1-5", () => {
    for (const score of [0, 6, -1, 100]) {
      expect(() => VerifierResult.parse({ score, feedback: "ok", issues: ["no_issues"] })).toThrow();
    }
  });

  it("rejects non-integer score", () => {
    expect(() => VerifierResult.parse({ score: 3.5, feedback: "ok", issues: ["no_issues"] })).toThrow();
  });

  it("accepts empty issues array", () => {
    expect(() => VerifierResult.parse({ score: 5, feedback: "perfect", issues: [] })).not.toThrow();
  });

  it("accepts multiple issue types", () => {
    expect(() => VerifierResult.parse({
      score: 2,
      feedback: "needs work",
      issues: ["missing_root_cause", "hallucinated_step"],
    })).not.toThrow();
  });

  it("rejects unknown issue enum", () => {
    expect(() => VerifierResult.parse({
      score: 3,
      feedback: "ok",
      issues: ["unknown_issue_type"],
    })).toThrow();
  });
});
