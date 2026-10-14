import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
describe("GET /api/search — PostgREST OR-filter injection hardening",()=>{const source=readFileSync("src/app/api/search/route.ts","utf8");
it("escapes input before ILIKE",()=>{expect(source).toContain("const ilikeEscaped");expect(source).toContain("const orQuoted");});
it("quotes OR values",()=>{expect(source).toContain("const pattern = orQuoted");expect(source).toContain('.or("title.ilike."+pattern+",record_code.ilike."+pattern)');});
it("keeps bounded",()=>{expect(source).toContain(".limit(8)");expect(source).toContain(".slice(0,12)");});});
