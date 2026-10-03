import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Phát hành văn bản: modeled off a real, mature reference workflow the user
// built and ran before, generalized for QARICA's multi-organization
// architecture (no hard-coded hospital name/department, manual document
// code instead of an org-prefixed auto-generated one — CLAUDE.md principle 1).
describe("Document publications module security and control gates", () => {
  it("POST (Đề nghị) only requires document_publication.view — any unit can submit a request, not just managers", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('requireApiPermission("document_publication.view")');
    expect(route).not.toContain('requireApiPermission("document_publication.manage")');
  });

  it("PATCH (every step past Đề nghị) requires document_publication.manage", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('requireApiPermission("document_publication.manage")');
  });

  it("the create-request form in the client renders unconditionally (not gated behind canManage), matching the API's looser .view-only POST", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).not.toContain("{canManage ? (");
    expect(client).toContain("Đề nghị văn bản mới");
  });

  it("is reachable from the sidebar only behind document_publication.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "PHÁT HÀNH VĂN BẢN", href: "/document-publications", icon: "file-text", permission: "document_publication.view" }');
  });

  it("keeps every query/write tenant-scoped by organization_id", () => {
    const list = read("src/app/api/document-publications/route.ts");
    expect(list).toContain('.eq("organization_id", organizationId)');
    expect(list).toContain("organization_id: organizationId");
    const item = read("src/app/api/document-publications/[id]/route.ts");
    expect(item).toContain('.eq("organization_id", organizationId)');
  });

  it("stores document codes manually (no org-prefixed auto-generated code) and assigns the reviewing department at request time, per the no-hard-coded-organization principle", () => {
    const migration = read("supabase/migrations/20261020_document_publications_v1.sql");
    expect(migration).toContain("no hard-coded hospital name");
    expect(migration).not.toMatch(/TTSG/);
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('String(body.document_code || "").trim()');
  });
});

describe("Document publications 6-stage pipeline (src/lib/document-publication-types.ts)", () => {
  const types = read("src/lib/document-publication-types.ts");

  it("defines the exact 6 stages in order: Đề nghị -> Soạn thảo -> Góp ý -> Rà soát -> Phê duyệt -> Phát hành", () => {
    expect(types).toContain(
      'export const DOCUMENT_PUBLICATION_STAGES = [\n  "REQUESTED",\n  "DRAFTING",\n  "COLLECTING_FEEDBACK",\n  "REVISING",\n  "APPROVING",\n  "PUBLISHED",\n] as const;',
    );
  });

  it("nextStage() advances one step at a time and returns null after PUBLISHED (no transition past the end)", () => {
    expect(types).toContain("export function nextStage(stage: DocumentPublicationStage): DocumentPublicationStage | null {");
    expect(types).toContain("if (idx < 0 || idx === DOCUMENT_PUBLICATION_STAGES.length - 1) return null;");
  });

  it("defines 4 document types, each mapped to an informational approver label (not permission-enforced in Đợt 1 — QARICA lacks Ban Giám Đốc sub-roles yet)", () => {
    expect(types).toContain('export const DOCUMENT_TYPES = ["OPERATIONAL", "CLINICAL_PROCEDURE", "CLINICAL_PROTOCOL", "NURSING"] as const;');
    expect(types).toContain("OPERATIONAL: \"GĐ Điều hành\",");
    expect(types).toContain("CLINICAL_PROCEDURE: \"GĐ Chuyên môn\",");
  });

  it("the PATCH route recomputes stage_due_date from STAGE_DUE_DAYS on every advance, clearing it once PUBLISHED", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain("update.stage_due_date = addDaysISO(new Date().toISOString().slice(0, 10), STAGE_DUE_DAYS[upcoming]);");
    expect(route).toContain("update.stage_due_date = null;");
  });

  it("transitioning into PUBLISHED requires document_code + effective_date and computes review_date as effective_date + 730 days", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });');
    expect(route).toContain('if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });');
    expect(route).toContain("update.review_date = addDaysISO(effectiveDate, 730);");
  });
});
