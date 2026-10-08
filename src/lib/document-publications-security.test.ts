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
    // Scoped to the "Đề nghị văn bản mới" section only — canManage legitimately
    // gates other, unrelated UI further down (Delete button, Xem who-hasn't-
    // acknowledged-yet toggle), which must stay manager-only.
    const formSection = client.slice(client.indexOf("Đề nghị văn bản mới"), client.indexOf("Đang xử lý"));
    expect(formSection).not.toContain("{canManage ? (");
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

// Phổ biến tài liệu sau khi phát hành: mô phỏng lại "Phiếu xác nhận thông
// hiểu tài liệu" thực tế (2 hình thức, chọn lúc Phát hành — thời điểm chốt
// nội dung cuối): SELF_READ (từng nhân viên tự xác nhận, theo dõi theo
// người) và TRAINING_REQUIRED (tự tạo 1 dòng Đào tạo quy trình, tái dùng
// workflow đào tạo sẵn có thay vì xây lại theo dõi đào tạo riêng cho văn bản).
describe("Document publications: phổ biến (dissemination) sau khi phát hành", () => {
  const patchRoute = read("src/app/api/document-publications/[id]/route.ts");

  it("requires an explicit dissemination_type (SELF_READ or TRAINING_REQUIRED) before PUBLISHED, same as document_code/effective_date", () => {
    expect(patchRoute).toContain('if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: "Chưa chọn hình thức phổ biến." }, { status: 400 });');
    expect(patchRoute).toContain("update.dissemination_type = disseminationType;");
  });

  it("TRAINING_REQUIRED auto-creates a procedure_trainings row linked back via document_publication_id, instead of building a separate training workflow for documents", () => {
    expect(patchRoute).toContain('if (disseminationType === "TRAINING_REQUIRED") {');
    expect(patchRoute).toContain('admin.from("procedure_trainings").insert({');
    expect(patchRoute).toContain("document_publication_id: id,");
  });

  it("SELF_READ acknowledgment only requires document_publication.view (any staff can self-confirm, not just managers) and only applies to a PUBLISHED, SELF_READ document", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain('requireApiPermission("document_publication.view")');
    expect(ackRoute).not.toContain('requireApiPermission("document_publication.manage")');
    expect(ackRoute).toContain('if (doc.stage !== "PUBLISHED" || doc.dissemination_type !== "SELF_READ")');
  });

  it("identity for an acknowledgment comes from auth.uid(), never hand-typed name/employee code/email like the old paper form", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain("user_id: auth.user.id,");
    expect(ackRoute).not.toContain("body.employee_code");
    expect(ackRoute).not.toContain("body.full_name");
  });

  it("acknowledging twice is idempotent (unique document_publication_id+user_id, upsert ignores duplicates) rather than erroring or double-counting", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain('{ onConflict: "document_publication_id,user_id", ignoreDuplicates: true }');
  });

  it("the acknowledgments table is tenant-scoped and tracks per-employee department for coverage reporting", () => {
    const migration = read("supabase/migrations/20261021_document_publication_dissemination_v1.sql");
    expect(migration).toContain("create table if not exists public.document_publication_acknowledgments");
    expect(migration).toContain("unique (document_publication_id, user_id)");
    expect(migration).toContain("department_id uuid references public.departments(id)");
  });

  it("the create-request form offers no dissemination_type field (it is chosen only at Phát hành, the moment content is finalized)", () => {
    const client = read("src/components/document-publications-client.tsx");
    const formSection = client.slice(client.indexOf("Đề nghị văn bản mới"), client.indexOf("Đang xử lý"));
    expect(formSection).not.toContain("disseminationType");
  });
});
