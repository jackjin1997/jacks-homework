import { describe, it, expect } from "vitest";
import { SessionIdSchema, ChatRequestBody } from "@/lib/identity";

describe("SessionIdSchema", () => {
  it("accepts bare UUID", () => {
    expect(() => SessionIdSchema.parse("550e8400-e29b-41d4-a716-446655440000")).not.toThrow();
  });
  it("rejects empty string", () => {
    expect(() => SessionIdSchema.parse("")).toThrow();
  });
  it("rejects prefixed UUID like 'u-001:550e...'", () => {
    expect(() => SessionIdSchema.parse("u-001:550e8400-e29b-41d4-a716-446655440000")).toThrow();
  });
  it("rejects arbitrary string", () => {
    expect(() => SessionIdSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("ChatRequestBody", () => {
  it("accepts { session_id, message }", () => {
    expect(() => ChatRequestBody.parse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      message: "hi",
    })).not.toThrow();
  });
  it("accepts message only (session_id optional)", () => {
    expect(() => ChatRequestBody.parse({ message: "hi" })).not.toThrow();
  });
  it("rejects extra userId field (strict mode — anti-spoofing)", () => {
    expect(() => ChatRequestBody.parse({
      message: "hi",
      userId: "other-user",
    })).toThrow();
  });
  it("rejects extra thread_id field (strict mode)", () => {
    expect(() => ChatRequestBody.parse({
      message: "hi",
      thread_id: "u-100:fake",
    })).toThrow();
  });
  it("rejects empty message", () => {
    expect(() => ChatRequestBody.parse({ message: "" })).toThrow();
  });
});
