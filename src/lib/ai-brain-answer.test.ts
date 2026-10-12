import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const answer = readFileSync("src/app/api/ai-brain/answer/route.ts","utf8");
const client = readFileSync("src/components/ai-brain-client.tsx","utf8");
const page = readFileSync("src/app/(app)/me/page.tsx","utf8");

describe("AI Brain answer safety invariants",()=>{
  it("queries notes under the caller's RLS session",()=>{
    expect(answer).toContain("requireApiContext()");
    expect(answer).toContain("auth.supabase.from");
    expect(answer).not.toContain("createAdminClient");
  });
  it("does not invoke an LLM without retrieved evidence",()=>{
    expect(answer.indexOf("if (!sources.length)")).toBeLessThan(answer.indexOf("const key = process.env.OPENAI_API_KEY"));
    expect(answer).toContain('mode:"no_evidence"');
  });
  it("keeps provider credentials on the server and validates citations",()=>{
    expect(answer).toContain("process.env.OPENAI_API_KEY");
    expect(answer).toContain("references.some");
    expect(answer).toContain("Uncited answer paragraph");
    expect(answer).toContain("retrieval_fallback");
    expect(client).not.toContain("OPENAI_API_KEY");
  });
  it("exposes a cited UI in the personal workspace",()=>{
    expect(page).toContain("<AiBrainClient />");
    expect(client).toContain('fetch("/api/ai-brain/answer"');
    expect(client).toContain("result.sources.map");
  });
});
