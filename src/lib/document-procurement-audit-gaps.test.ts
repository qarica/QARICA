import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Đợt audit Trung bình/Thấp — 3 module Công văn/Phát hành văn bản/Mua sắm
// trước đây không ghi audit_logs cho bất kỳ thao tác nào, 2 module không kiểm
// tra department_id gửi từ client có thuộc đúng tổ chức hay không, và không
// module nào có route xoá/huỷ cho bản ghi khai báo nhầm.
describe("Công văn/Phát hành văn bản/Mua sắm: audit_logs + validate department_id + xoá", () => {
  it("incoming-documents: POST và PATCH đều ghi audit_logs", () => {
    const route = read("src/app/api/incoming-documents/route.ts");
    expect(route).toContain('action_type: "INCOMING_DOCUMENT_CREATE"');
    const idRoute = read("src/app/api/incoming-documents/[id]/route.ts");
    expect(idRoute).toContain('action_type: "INCOMING_DOCUMENT_UPDATE"');
  });

  it("incoming-documents: department_id được validate thuộc đúng tổ chức trước khi gán", () => {
    const idRoute = read("src/app/api/incoming-documents/[id]/route.ts");
    expect(idRoute).toContain('.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();');
    expect(idRoute).toContain('"Khoa/phòng được giao không hợp lệ."');
  });

  it("incoming-documents: có route DELETE, ghi audit_logs, yêu cầu .manage", () => {
    const idRoute = read("src/app/api/incoming-documents/[id]/route.ts");
    expect(idRoute).toContain("export async function DELETE(");
    expect(idRoute).toContain('action_type: "INCOMING_DOCUMENT_DELETE"');
    const deleteFn = idRoute.slice(idRoute.indexOf("export async function DELETE"));
    expect(deleteFn).toContain('requireApiPermission("incoming_documents.manage")');
  });

  it("document-publications: POST và PATCH (advance) đều ghi audit_logs", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('action_type: "DOCUMENT_PUBLICATION_CREATE"');
    const idRoute = read("src/app/api/document-publications/[id]/route.ts");
    expect(idRoute).toContain("action_type: `DOCUMENT_PUBLICATION_ADVANCE_${upcoming}`");
  });

  it("document-publications: có route DELETE chỉ cho phép ở bước REQUESTED, ghi audit_logs", () => {
    const idRoute = read("src/app/api/document-publications/[id]/route.ts");
    expect(idRoute).toContain("export async function DELETE(");
    expect(idRoute).toContain('if (current.stage !== "REQUESTED") return NextResponse.json({ error: "Chỉ xoá được văn bản còn ở bước Đề nghị." }');
    expect(idRoute).toContain('action_type: "DOCUMENT_PUBLICATION_DELETE"');
  });

  it("procurement: department_id đề xuất được validate thuộc đúng tổ chức (lỗ hổng cũ: nhận thẳng từ client không kiểm tra)", () => {
    const route = read("src/app/api/procurement/requests/route.ts");
    expect(route).toContain('.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();');
    expect(route).toContain('"Khoa/phòng đề xuất không hợp lệ."');
  });

  it("procurement: POST và PATCH (workflow duyệt) đều ghi audit_logs", () => {
    const route = read("src/app/api/procurement/requests/route.ts");
    expect(route).toContain('action_type: "PROCUREMENT_REQUEST_CREATE"');
    const idRoute = read("src/app/api/procurement/requests/[id]/route.ts");
    expect(idRoute).toContain("action_type: `PROCUREMENT_REQUEST_${action}`");
  });
});

describe("Phát hành văn bản: xác nhận 'Tự đọc hiểu' hiện danh sách chưa xác nhận, không chỉ đếm số", () => {
  it("trang server fetch toàn bộ nhân sự đang hoạt động để tính phần bù chưa xác nhận", () => {
    const page = read("src/app/(app)/document-publications/page.tsx");
    expect(page).toContain('.from("profiles").select("user_id,full_name,email").eq("organization_id", user.organizationId).eq("is_active", true)');
    expect(page).toContain("staffRoster=");
  });

  it("client tính unconfirmedStaff = staffRoster trừ những ai đã có trong acks, và có nút mở danh sách", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("const unconfirmedStaff = (documentId: string) =>");
    expect(client).toContain("chưa xác nhận");
  });
});
