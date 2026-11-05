import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Module mới theo yêu cầu tường minh: "Hồ sơ năng lực hành nghề" — GPHN/CCHN,
// văn bằng, chứng chỉ, phạm vi hành nghề, quyết định phân công cho từng nhân
// viên y tế. KHÁC physician_license_registrations (bảng đó chỉ theo dõi HẠN
// ĐĂNG KÝ trên cổng SYT/BHYT: effective_date/deadline/status, không có field
// nào trong bảng mới này) — tách bảng riêng theo lựa chọn tường minh của
// người dùng, không gộp 2 nghiệp vụ khác nhau vào 1 bảng.
describe("Migration: practitioner_credentials + practitioner_credential_documents", () => {
  const migration = read("supabase/migrations/20261117000000_practitioner_credentials_v1.sql");

  it("tạo bảng practitioner_credentials, bật RLS theo organization_id, khai báo quyền module riêng", () => {
    expect(migration).toContain("create table if not exists public.practitioner_credentials");
    expect(migration).toContain("alter table public.practitioner_credentials enable row level security");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
    expect(migration).toContain("'practitioner_credentials.view'");
    expect(migration).toContain("'practitioner_credentials.manage'");
  });

  it("license_type giới hạn đúng 3 loại hồ sơ hành nghề (GPHN/CCHN/CCHN_DUOC), nullable", () => {
    expect(migration).toContain("license_type text check (license_type is null or license_type in ('GPHN','CCHN','CCHN_DUOC'))");
  });

  it("decision_status giới hạn đúng 4 trạng thái quy trình soạn quyết định", () => {
    expect(migration).toContain("decision_status text not null default 'CHUA_SOAN' check (decision_status in ('CHUA_SOAN','DA_SOAN','DA_KY','LUU_HO_SO'))");
  });

  it("tách bảng con practitioner_credential_documents cho văn bằng/chứng chỉ/QĐ bổ sung phạm vi — không hard-code số lượng cố định (khác 2 cột lặp Chứng chỉ 1/2 trong file Excel gốc)", () => {
    expect(migration).toContain("create table if not exists public.practitioner_credential_documents");
    expect(migration).toContain("document_type text not null check (document_type in ('DEGREE','SPECIALIST_DEGREE','CERTIFICATE','SCOPE_ADJUSTMENT'))");
    expect(migration).toContain("credential_id uuid not null references public.practitioner_credentials(id) on delete cascade");
    expect(migration).toContain("alter table public.practitioner_credential_documents enable row level security");
  });
});

describe("API /api/practitioner-credentials — ranh giới view/manage nhất quán", () => {
  it("GET danh sách dùng practitioner_credentials.view, lọc theo organization_id", () => {
    const route = read("src/app/api/practitioner-credentials/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.view")');
    expect(route).toContain('.eq("organization_id", organizationId)');
  });

  it("POST tạo mới dùng practitioner_credentials.manage, validate license_type và decision_status, ghi audit_logs", () => {
    const route = read("src/app/api/practitioner-credentials/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain("Loại hồ sơ không hợp lệ");
    expect(route).toContain("Trạng thái quyết định không hợp lệ");
    expect(route).toContain('action_type: "PRACTITIONER_CREDENTIAL_CREATE"');
  });

  it("PATCH sửa dùng practitioner_credentials.manage, xác nhận hồ sơ thuộc đúng tổ chức trước khi cho sửa", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain("existing.organization_id !== organizationId");
    expect(route).toContain('action_type: "PRACTITIONER_CREDENTIAL_UPDATE"');
  });
});

describe("API /api/practitioner-credentials/[id]/documents — văn bằng/chứng chỉ/QĐ bổ sung phạm vi", () => {
  it("POST dùng practitioner_credentials.manage, xác nhận hồ sơ thuộc đúng tổ chức, validate document_type", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/documents/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain("credential.organization_id !== organizationId");
    expect(route).toContain("Loại văn bằng/chứng chỉ không hợp lệ");
  });

  it("DELETE xác nhận văn bằng/chứng chỉ thuộc đúng hồ sơ và tổ chức trước khi xoá", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/documents/[docId]/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain("document.organization_id !== organizationId || document.credential_id !== id");
  });
});

describe("Trang /practitioner-credentials và điều hướng", () => {
  it("page.tsx chặn truy cập bằng practitioner_credentials.view trước khi tải dữ liệu", () => {
    const page = read("src/app/(app)/practitioner-credentials/page.tsx");
    expect(page).toContain('requirePermission(user, "practitioner_credentials.view")');
    expect(page).toContain("practitioner_credential_documents(id,document_type,title,specialization,document_no,issued_at,issued_by,note)");
  });

  it("navigation.ts có mục Hồ sơ năng lực hành nghề (gộp chung nhóm HÀNH NGHỀ với Theo dõi hạn đăng ký hành nghề theo yêu cầu gộp menu), gắn đúng quyền xem", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).not.toContain('id: "practitioner-credentials"');
    expect(nav).toContain('{ label: "Hồ sơ năng lực hành nghề", href: "/practitioner-credentials", icon: "folder-check", permission: "practitioner_credentials.view" }');
  });
});

describe("practitioner-credentials-client.tsx — đúng quy ước UI chung của repo", () => {
  const client = read("src/components/practitioner-credentials-client.tsx");

  it("bảng danh sách bọc trong .table-wrap", () => {
    expect(client).toContain('<div className="table-wrap">');
  });

  it("tiêu đề modal bọc trong .modal-head, không đặt h2 trực tiếp trong .modal-card", () => {
    expect(client).toMatch(/className="modal-card[^"]*"[\s\S]{0,40}<div className="modal-head">/);
  });

  it("nút Soạn QĐ mở bản nháp có cảnh báo rõ ràng, dùng navigator.clipboard để copy, không gọi AI", () => {
    expect(client).toContain("BẢN NHÁP — CẦN RÀ SOÁT TRƯỚC KHI TRÌNH KÝ");
    expect(client).toContain("buildAssignmentDecisionDraft(decisionFor, decisionFor.practitioner_credential_documents)");
    expect(client).toContain("navigator.clipboard.writeText(draftText)");
  });

  it("chỉ cho thêm văn bằng/chứng chỉ sau khi hồ sơ đã có id (đã lưu lần đầu)", () => {
    expect(client).toContain("{form.id ? (");
    expect(client).toContain("Lưu hồ sơ trước, sau đó mở lại Sửa để bổ sung văn bằng/chứng chỉ");
  });

  // Yêu cầu tường minh: "muốn nó như file excel" — bảng danh sách phải hiện
  // trực tiếp đầy đủ các trường như sheet INPUT gốc, không ẩn vào modal Sửa.
  it("bảng danh sách hiện trực tiếp đầy đủ các trường như sheet INPUT gốc (giới tính, CCCD, văn bằng, chứng chỉ, kỹ thuật đề xuất, ghi chú...), không chỉ tóm tắt vài cột", () => {
    for (const header of [
      "Giới tính", "CCCD", "SĐT / Email", "Ngày cấp / Nơi cấp", "Phạm vi bổ sung/điều chỉnh",
      "Văn bằng chuyên môn", "Văn bằng chuyên khoa", "Chứng chỉ", "Kỹ thuật đề xuất",
      "Ngày ĐK HN", "Tình trạng hành nghề", "Ghi chú",
    ]) {
      expect(client).toContain(`<th>${header}</th>`);
    }
  });
});
