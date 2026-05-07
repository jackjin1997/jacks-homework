import { z } from "zod";

export const VerifierResult = z.object({
  score: z.number().int().min(1).max(5),
  feedback: z.string(),
  issues: z.array(
    z.enum([
      "missing_root_cause",
      "missing_resolution_steps",
      "format_inconsistent",
      "hallucinated_step",
      "no_issues",
    ]),
  ),
});

export type VerifierResult = z.infer<typeof VerifierResult>;
