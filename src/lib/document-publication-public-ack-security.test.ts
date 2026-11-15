import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// "Khi ban hành 1 quy trình mình sẽ gửi email ban hành toàn viện... xác
// nhận đọc hiểu ko xác nhận trực tiếp trong qarica ko cần đăng nhập" — 1
// ngoại lệ CÓ CHỦ Ý song song với nút "Tôi đã đọc và hiểu" trong app hiện có
// (API /api/document-publications/[id]/acknowledge, vẫn yêu cầu đăng nhập,
// không đổi). Route công khai nằm riêng ở /api/public/document-ack/**.
describe("Public document-ack routes (/api/public/document-ack/**): cố ý không đăng nhập, nhưng phải chặn đúng chỗ", () => {
  const getRoute = read("src/app/api/public/document-ack/[id]/route.ts");
  const submitRoute = read("src/app/api/public/document-ack/[id]/submit/route.ts");

  it("KHÔNG gọi requireApiPermission/requireUserContext nhưng vẫn dùng createAdminClient (service role)", () => {
    for (const src of [getRoute, submitRoute]) {
      expect(src).not.toContain("requireApiPermission(");
      expect(src).not.toContain("requireUserContext(");
      expect(src).toContain("createAdminClient");
    }
  });

  it("chỉ mở xác nhận khi stage=PUBLISHED VÀ dissemination_type=SELF_READ — đúng điều kiện route acknowledge trong app đã dùng", () => {
    expect(getRoute).toContain('doc.stage === "PUBLISHED" && doc.dissemination_type === "SELF_READ"');
    expect(submitRoute).toContain('doc.stage !== "PUBLISHED" || doc.dissemination_type !== "SELF_READ"');
  });

  it("chặn nộp trùng theo mã NV đã chuẩn hoá (dùng lại normalizeEmployeeCode từ training-self-test), chỉ so với xác nhận ẩn danh khác (user_id null) — không đụng xác nhận qua auth.uid()", () => {
    expect(submitRoute).toContain('from "@/lib/training-self-test"');
    expect(submitRoute).toContain('.is("user_id", null)');
    expect(submitRoute).toContain("status: 409");
  });

  it("ghi nhận ẩn danh KHÔNG set user_id (giữ phân biệt rõ với xác nhận qua tài khoản)", () => {
    const insertBlock = submitRoute.slice(submitRoute.indexOf(".insert({"));
    expect(insertBlock).toContain("employee_name: employeeName");
    expect(insertBlock).toContain("employee_code: employeeCodeRaw");
    expect(insertBlock).not.toContain("user_id:");
  });

  // Phát hiện thực tế khi tự quét QR thử: "nhập tên nv và mã số nhưng thiếu
  // khoa phòng" + "phần mềm phải lưu lại email hoặc thời gian của nhân viên
  // xác nhận". Thời gian đã có sẵn (confirmed_at default now()); bổ sung
  // khoa/phòng (bắt buộc, chọn từ danh sách thật — không tự gõ) + email
  // (tuỳ chọn) làm thêm bằng chứng xác nhận.
  it("bắt buộc chọn khoa/phòng (department_id) — validate thuộc đúng tổ chức của văn bản, không tin dữ liệu client", () => {
    expect(submitRoute).toContain('if (!departmentId) return NextResponse.json({ error: "Chưa chọn khoa/phòng." }');
    expect(submitRoute).toContain('.from("departments").select("id").eq("id", departmentId).eq("organization_id", doc.organization_id)');
  });

  it("email là tuỳ chọn (không required), lưu cùng hàng xác nhận làm thêm bằng chứng", () => {
    expect(submitRoute).not.toContain('if (!email)');
    const insertBlock = submitRoute.slice(submitRoute.indexOf(".insert({"));
    expect(insertBlock).toContain("department_id: departmentId");
    expect(insertBlock).toContain("email: email || null");
  });

  it("GET trả kèm danh sách khoa/phòng thật của tổ chức để chọn (không tự gõ tay, tránh sai chính tả/trùng tên)", () => {
    expect(getRoute).toContain('.from("departments").select("id,name").eq("organization_id", doc.organization_id).eq("is_active", true)');
  });
});

describe("middleware.ts: /xac-nhan-doc-hieu/** là route công khai", () => {
  it("publicPath bao gồm /xac-nhan-doc-hieu/", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('path.startsWith("/xac-nhan-doc-hieu/")');
  });
});

describe("migration 20261130000005: nới user_id nullable có kiểm soát (constraint bắt buộc 1 trong 2 cách định danh)", () => {
  const migration = read("supabase/migrations/20261130000005_document_publication_public_acknowledgment_v1.sql");

  it("user_id không còn not null, nhưng có CHECK buộc phải có employee_name+employee_code khi không có user_id", () => {
    expect(migration).toContain("alter column user_id drop not null");
    expect(migration).toContain("check (user_id is not null or (employee_name is not null and employee_code is not null))");
  });
});

describe("Tab Tự đọc hiểu: tách riêng số đếm xác nhận qua tài khoản QARICA vs qua link công khai", () => {
  it("ackCount chỉ đếm acks có user_id (so được với staffRoster), publicAckCount đếm phần ẩn danh — không gộp chung gây lệch mẫu số với 'chưa xác nhận'", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("acks.filter((a) => a.document_publication_id === documentId && a.user_id).length");
    expect(client).toContain("acks.filter((a) => a.document_publication_id === documentId && !a.user_id).length");
  });

  it("có nút mở QR/link công khai cho quản lý văn bản, dẫn tới /xac-nhan-doc-hieu/[id]", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("Link/QR gửi email");
    expect(client).toContain("/xac-nhan-doc-hieu/${doc.id}");
  });
});
