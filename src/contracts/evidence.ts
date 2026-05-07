import { z } from "zod";

export const Evidence = z.object({
  // source 锚定目录边界，禁 data/kb_fake/ 等前缀混淆 (spec v1.3.2 P0-8 + v1.3.1 P2-9)
  source: z.string().regex(
    /^data\/(kb\/|users\.json$|system_status\.json$|policies\.yaml$)/,
    "source must be a real mock data path: data/kb/..., data/users.json, data/system_status.json, or data/policies.yaml",
  ),
  excerpt: z.string().max(200, "excerpt truncated to 200 chars (server-side enforced, see §5.5)"),
  timestamp: z.string(),
  tool: z.string().describe("tool name that produced this evidence (search_kb / get_user / ...)"),
});

export type Evidence = z.infer<typeof Evidence>;
