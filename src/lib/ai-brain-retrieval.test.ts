import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/ai-brain/retrieve/route.ts", "utf8");

describe("AI Brain grounding and privacy guardrails", () => {
  it("requires a signed-in request context", () => {
    expect(route).toContain("requireApiContext()");
    expect(route).toContain("auth.supabase");
    expect(route).not.toContain("createAdminClient");
  });
  it("limits input, source count and excerpt size", () => {
    expect(route).toContain("question.length > 500");
    expect(route).toContain(".limit(8)");
    expect(route).toContain(".slice(0, 1200)");
  });
  it("does not fabricate generated answers without an AI provider", () => {
    expect(route).toContain('mode: "grounded_retrieval"');
    expect(route).toContain("generated: false");
    expect(route).toContain("Chưa tìm thấy nguồn đủ căn cứ");
  });
  it("filters archived knowledge and relies on authenticated RLS", () => {
    expect(route).toContain('.eq("status", "ACTIVE")');
    expect(route).toContain('.from("knowledge_notes")');
  });
});
