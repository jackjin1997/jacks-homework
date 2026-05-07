import { describe, it, expect } from "vitest";

describe("/api/resume route module", () => {
  it("exports POST handler", async () => {
    const mod = await import("@/app/api/resume/route");
    expect(typeof mod.POST).toBe("function");
  });
});
