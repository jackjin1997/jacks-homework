import { describe, it, expect } from "vitest";
import { truncateEvidence } from "@/lib/evidence";

const baseE = (i: number) => ({
  source: `data/kb/auth/article-${i}.md`,
  excerpt: "x".repeat(300),  // 超 200 触发截断
  timestamp: new Date().toISOString(),
  tool: "search_kb",
});

describe("truncateEvidence", () => {
  it("returns last 10 when input has > 10", () => {
    const arr = Array.from({ length: 15 }, (_, i) => baseE(i));
    const out = truncateEvidence(arr);
    expect(out).toHaveLength(10);
    expect(out[0].source).toBe("data/kb/auth/article-5.md");
    expect(out[9].source).toBe("data/kb/auth/article-14.md");
  });

  it("returns all when input <= 10", () => {
    const arr = Array.from({ length: 5 }, (_, i) => baseE(i));
    expect(truncateEvidence(arr)).toHaveLength(5);
  });

  it("truncates excerpt > 200 chars to 200 chars (with ...)", () => {
    const out = truncateEvidence([baseE(1)]);
    expect(out[0].excerpt.length).toBe(200);
    expect(out[0].excerpt.endsWith("...")).toBe(true);
  });

  it("preserves excerpt < 200 unchanged", () => {
    const arr = [{ ...baseE(1), excerpt: "short" }];
    expect(truncateEvidence(arr)[0].excerpt).toBe("short");
  });

  it("handles empty array", () => {
    expect(truncateEvidence([])).toEqual([]);
  });
});
