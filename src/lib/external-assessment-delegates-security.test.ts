import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Quản lý đoàn thẩm định/tiếp đoàn — explicit request to combine into the
// EXISTING "Đánh giá ngoài" module (external_assessment_events) rather than
// a standalone module, per CLAUDE.md's one-source-of-truth principle. No new
// permission codes: reuses the same criteria.view/review/manage family that
// already gates the entire Đánh giá ngoài feature.
describe("External assessment delegates — integrated into Đánh giá ngoài, not standalone", () => {
  it("is its own child table keyed by external_assessment_event_id, not a parallel module", () => {
    const migration = read("supabase/migrations/20261018_external_assessment_delegates_v1.sql");
    expect(migration).toContain("create table if not exists public.external_assessment_delegates");
    expect(migration).toContain("external_assessment_event_id uuid not null references public.external_assessment_events(id) on delete cascade");
  });

  it("introduces no new permission codes — reuses criteria.view/review/manage", () => {
    const migration = read("supabase/migrations/20261018_external_assessment_delegates_v1.sql");
    expect(migration).not.toContain("insert into public.permissions");
    const listRoute = read("src/app/api/external-assessments/[id]/delegates/route.ts");
    expect(listRoute).toContain('p_permission_code: "criteria.view"');
    expect(listRoute).toContain('p_permission_code: "criteria.review"');
    expect(listRoute).toContain('p_permission_code: "criteria.manage"');
  });

  it("resolves the event via the record_id, rejecting records that aren't EXTERNAL_ASSESSMENT or aren't visible to the caller", () => {
    const listRoute = read("src/app/api/external-assessments/[id]/delegates/route.ts");
    expect(listRoute).toContain('.eq("record_type", "EXTERNAL_ASSESSMENT")');
  });

  it("gates writes (add/edit/delete) behind criteria.manage OR criteria.review, same as the workflow route", () => {
    const addRoute = read("src/app/api/external-assessments/[id]/delegates/route.ts");
    const idRoute = read("src/app/api/external-assessments/[id]/delegates/[delegateId]/route.ts");
    expect(addRoute).toContain("if (!manage && !review)");
    expect(idRoute).toContain("async function checkManageOrReview");
  });

  // Báo cáo audit bảo mật (IDOR): PATCH/DELETE /[id]/delegates/[delegateId]
  // trước đây chỉ xác nhận recordId (param :id) thuộc quyền xem của người
  // gọi, nhưng câu ghi thật sự chỉ lọc theo delegateId (PK toàn cục) —
  // không ràng buộc delegateId phải thuộc ĐÚNG recordId/tổ chức đang thao
  // tác. Người có quyền ở tổ chức A, miễn biết delegateId của tổ chức B,
  // vẫn sửa/xoá được thành viên đoàn của tổ chức B. Sửa bằng cách resolve
  // external_assessment_event_id ĐÚNG của recordId rồi bắt buộc cả PATCH
  // lẫn DELETE phải khớp cả 2 điều kiện (id lẫn event), không chỉ 1.
  it("PATCH/DELETE [delegateId] bắt buộc khớp CẢ delegateId LẪN event đã resolve từ recordId (chặn IDOR xuyên tổ chức/hồ sơ)", () => {
    const idRoute = read("src/app/api/external-assessments/[id]/delegates/[delegateId]/route.ts");
    expect(idRoute).toContain('.eq("id", delegateId)\n    .eq("external_assessment_event_id", eventId)');
    expect(idRoute).toContain('.delete({ count: "exact" }).eq("id", delegateId).eq("external_assessment_event_id", eventId)');
    expect(idRoute).toContain("if (!count) return NextResponse.json({ error: \"Không tìm thấy thành viên đoàn.\" }, { status: 404 });");
  });

  it("is rendered on the Đánh giá ngoài detail page only, right after the existing DomainRecordDetail block", () => {
    const page = read("src/components/domain-record-page.tsx");
    expect(page).toContain('import { ExternalAssessmentDelegatesClient } from "@/components/external-assessment-delegates-client";');
    expect(page).toContain('record.record_type === "EXTERNAL_ASSESSMENT" ? (');
    expect(page).toContain("<ExternalAssessmentDelegatesClient recordId={record.id} canManage={hasAnyPermission(user, [\"criteria.manage\", \"criteria.review\"])} />");
  });
});
