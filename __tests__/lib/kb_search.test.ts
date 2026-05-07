import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { searchKB, loadAllKB } from "@/lib/kb_search";
import { KB_DIR } from "@/lib/paths";

describe("kb_search", () => {
  it("loads at least 3 articles", () => {
    expect(loadAllKB().length).toBeGreaterThanOrEqual(3);
  });

  it("finds okta article by symptom keyword", () => {
    const hits = searchKB("password reset doesn't help");
    expect(hits[0].path).toContain("okta_session_corruption");
  });

  it("finds vpn article by category filter", () => {
    const hits = searchKB("disconnect", "network");
    expect(hits[0].path).toContain("vpn");
  });

  it("returns empty when no match", () => {
    expect(searchKB("xxxqqqzzz")).toEqual([]);
  });

  it("skips .draft.md files (v1.6 sync)", () => {
    const draftPath = path.join(KB_DIR, "incidents", "test_x.draft.md");
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    fs.writeFileSync(
      draftPath,
      "---\ntitle: Test Draft\ncategory: incidents\nsymptoms: [\"unique-keyword-xyzqq\"]\nseverity: P3\nlast_updated: 2026-05-05\n---\n\n## Symptoms\nunique-keyword-xyzqq matched\n",
    );
    try {
      const hits = searchKB("unique-keyword-xyzqq");
      expect(hits).toEqual([]); // draft 文件不应被命中
    } finally {
      fs.unlinkSync(draftPath);
    }
  });
});
