import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { searchKB } from "@/lib/kb_search";

export const makeSearchKbTool = () => tool(
  async ({ query, category }, config) => {
    const hits = searchKB(query, category);
    const summary = hits.length === 0
      ? JSON.stringify({ matched: false, hits: [] })
      : JSON.stringify({
          matched: true,
          hits: hits.slice(0, 5).map((h) => ({
            source: h.path,
            title: h.title,
            category: h.category,
            symptoms: h.symptoms,
            excerpt: h.body.slice(0, 600),
            score: h.score,
          })),
        });

    // 累积 evidence（仅当有命中时）
    const newEvidence = hits.slice(0, 3).map((h) => ({
      source: h.path,
      excerpt: h.body.slice(0, 200),
      timestamp: new Date().toISOString(),
      tool: "search_kb",
    }));

    return new Command({
      update: {
        evidenceCollected: newEvidence.length > 0 ? newEvidence : undefined,
        messages: [{ role: "tool", content: summary, tool_call_id: config?.toolCall?.id ?? "search_kb" }],
      },
    });
  },
  {
    name: "search_kb",
    description: "Search the IT knowledge base by keywords. Optional category filter (auth, network, access, incidents). Returns top hits with source path for inline citation.",
    schema: z.object({
      query: z.string().describe("user-described symptom or keywords"),
      category: z.enum(["auth", "network", "access", "incidents"]).optional(),
    }),
  },
);

// Backward-compat for tests / single-userId scenarios
export const searchKbTool = makeSearchKbTool();
