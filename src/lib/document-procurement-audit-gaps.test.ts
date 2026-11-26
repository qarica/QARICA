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
    expect(route).toContain('action_type: directPublish ? "DOCUMENT_PUBLICATION_DIRECT_PUBLISH" : "DOCUMENT_PUBLICATION_CREATE"');
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

// "Tự đọc hiểu" dời sang /procedure-trainings (menu theo dõi gộp chung với
// "Cần đào tạo" — xem procedure-trainings-security.test.ts và
// document-publications-security.test.ts describe "phổ biến... dời sang
// /procedure-trainings" cho các assertion đầy đủ hơn). Báo cáo thực tế sau
// đó: "Tài liệu tự đọc hiểu không nên xác nhận bên trong QARICA mà chỉ xác
// nhận bằng QR hoặc link... bên loại tự đọc hiểu cũng chưa có dashboard
// thống kê giám sát" — bỏ hẳn cơ chế "chưa xác nhận theo từng người" (so với
// staffRoster QARICA, không còn đúng khi acks giờ ẩn danh qua QR), thay bằng
// dashboard tuân thủ theo khoa/phòng (departments.staff_count làm mẫu số).
describe("Phát hành văn bản: 'Tự đọc hiểu' có dashboard giám sát theo khoa/phòng, không còn ở document-publications", () => {
  it("trang procedure-trainings/page.tsx (menu theo dõi gộp) fetch departments.staff_count để tính tuân thủ theo khoa/phòng", () => {
    const page = read("src/components/procedure-trainings-page.tsx");
    expect(page).toContain('.from("departments").select("id,name,staff_count")');
    expect(page).toContain("departments=");
  });

  it("client procedure-trainings-client.tsx tính deptCompliance = acks theo department_id / (staff_count × số văn bản), và hiện bảng giám sát", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("const deptCompliance = departments");
    expect(client).toContain("Tuân thủ tự đọc hiểu theo khoa/phòng");
  });

  it("không còn sống trong document-publications-client.tsx — Thư viện văn bản chỉ còn 1 liên kết trỏ sang /procedure-trainings", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).not.toContain("const unconfirmedStaff = (documentId: string) =>");
    expect(client).not.toContain("Tôi đã đọc và hiểu");
    expect(client).toContain("Tự đọc hiểu - xem tiến độ →");
  });
});
