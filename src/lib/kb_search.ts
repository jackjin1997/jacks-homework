import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { KB_DIR } from "./paths";

export type KBArticle = {
  path: string;        // relative to repo root, e.g. "data/kb/auth/okta.md"
  title: string;
  category: string;
  symptoms: string[];
  body: string;        // markdown body without frontmatter
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".draft.md")) continue;  // v1.6 同步：跳过草稿
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

export function loadAllKB(): KBArticle[] {
  return walk(KB_DIR).map((absPath) => {
    const raw = fs.readFileSync(absPath, "utf-8");
    const { data, content } = matter(raw);
    return {
      path: path.relative(process.cwd(), absPath),
      title: String(data.title ?? path.basename(absPath, ".md")),
      category: String(data.category ?? "uncategorized"),
      symptoms: Array.isArray(data.symptoms) ? data.symptoms.map(String) : [],
      body: content.trim(),
    };
  });
}

/** 简单关键词匹配 — 不引入向量库。返回按 score 倒序的命中。 */
export function searchKB(
  query: string,
  category?: string,
): Array<KBArticle & { score: number }> {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const all = loadAllKB();
  const filtered = category ? all.filter((a) => a.category === category) : all;
  return filtered
    .map((a) => {
      const haystack = [a.title, ...a.symptoms, a.body].join(" ").toLowerCase();
      let score = 0;
      for (const t of tokens) if (haystack.includes(t)) score += 1;
      // symptom hit weight ×2
      for (const s of a.symptoms) if (q.includes(s.toLowerCase())) score += 2;
      return { ...a, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
