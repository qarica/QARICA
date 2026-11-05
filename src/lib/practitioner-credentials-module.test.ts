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
    expect(route).toContain('action_type: "PRACTITIONER_CREDENTIAL_CREATE"');
  });

  it("PATCH sửa dùng practitioner_credentials.manage, xác nhận hồ sơ thuộc đúng tổ chức trước khi cho sửa", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/route.ts");
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain("existing.organization_id !== organizationId");
    expect(route).toContain('action_type: "PRACTITIONER_CREDENTIAL_UPDATE"');
  });
});

// Rà soát nghiệp vụ sau khi ship: migration 20261118000000 dọn trùng lặp
// "phạm vi bổ sung" (chỉ còn bảng con documents), thêm go-live-style gate cho
// decision_status='DA_KY', thay decision_file_url (text tự do) bằng file lưu
// Storage thật, và liên kết physician_license_registrations ↔
// practitioner_credentials (trước đó chỉ gộp chung menu, chưa liên kết dữ liệu).
describe("Migration 20261118000000 — gate quyết định, dọn trùng lặp phạm vi bổ sung, liên kết 2 bảng hành nghề", () => {
  const migration = read("supabase/migrations/20261118000000_practitioner_credentials_gates_v1.sql");

  it("xoá 4 cột phẳng scope_adjustment_* trên practitioner_credentials — chỉ còn đúng 1 nguồn (bảng con documents)", () => {
    expect(migration).toContain("alter table public.practitioner_credentials drop column if exists scope_adjustment_text;");
    expect(migration).toContain("alter table public.practitioner_credentials drop column if exists scope_adjustment_decision_no;");
    expect(migration).toContain("alter table public.practitioner_credentials drop column if exists scope_adjustment_decision_at;");
    expect(migration).toContain("alter table public.practitioner_credentials drop column if exists scope_adjustment_issued_by;");
  });

  it("thay decision_file_url (text tự do) bằng file lưu Storage thật + cột xác minh go-live-style", () => {
    expect(migration).toContain("alter table public.practitioner_credentials drop column if exists decision_file_url;");
    expect(migration).toContain("alter table public.practitioner_credentials add column if not exists decision_file_path text;");
    expect(migration).toContain("alter table public.practitioner_credentials add column if not exists decision_file_name text;");
    expect(migration).toContain("alter table public.practitioner_credentials add column if not exists decision_verified_at timestamptz;");
    expect(migration).toContain("alter table public.practitioner_credentials add column if not exists decision_verified_by uuid references auth.users(id);");
    expect(migration).toContain("alter table public.practitioner_credentials add column if not exists updated_by uuid references auth.users(id);");
  });

  it("liên kết physician_license_registrations.credential_id -> practitioner_credentials, nullable", () => {
    expect(migration).toContain("alter table public.physician_license_registrations add column if not exists credential_id uuid references public.practitioner_credentials(id);");
  });
});

describe("Gate 'Đã ký' (go-live-style, giống emr_rollout_items): cần file thật + xác minh 4 mắt, không tự đặt tay", () => {
  it("POST tạo mới từ chối decision_status='DA_KY' ngay từ khi tạo", () => {
    const route = read("src/app/api/practitioner-credentials/route.ts");
    expect(route).toContain('const CREATABLE_DECISION_STATUSES = new Set(["CHUA_SOAN", "DA_SOAN", "LUU_HO_SO"]);');
  });

  it("PATCH từ chối decision_status='DA_KY' nếu không kèm verify_completed:true", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/route.ts");
    expect(route).toContain('if (decisionStatus === "DA_KY" && body.verify_completed !== true)');
  });

  it("verify_completed đòi hỏi đã có file quyết định và người xác minh khác người vừa sửa gần nhất (4 mắt)", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/route.ts");
    expect(route).toContain("if (!existing.decision_file_path) return NextResponse.json");
    expect(route).toContain("existing.updated_by && existing.updated_by === auth.user.id");
    expect(route).toContain('patch.decision_status = "DA_KY";');
    expect(route).toContain("patch.decision_verified_at = new Date().toISOString();");
    expect(route).toContain("patch.decision_verified_by = auth.user.id;");
  });

  it("rời khỏi DA_KY (hoặc không xác minh) làm mất hiệu lực xác minh cũ", () => {
    const route = read("src/app/api/practitioner-credentials/[id]/route.ts");
    expect(route).toContain('patch.decision_verified_at = null;\n    patch.decision_verified_by = null;');
  });
});

describe("API /api/practitioner-credentials/[id]/file — upload/xem/xoá file quyết định qua Supabase Storage thật (thay cho ô nhập link text tự do decision_file_url cũ)", () => {
  const route = read("src/app/api/practitioner-credentials/[id]/file/route.ts");

  it("dùng chung bucket qlcl-evidence, kiểm tra loại file và dung lượng như EMR/evidence", () => {
    expect(route).toContain('const BUCKET = "qlcl-evidence"');
    expect(route).toContain("evidenceFilePolicy(originalFileName)");
    expect(route).toContain("fileValue.size > MAX_FILE_SIZE");
  });

  it("POST/GET/DELETE đều dùng practitioner_credentials permission đúng ranh giới view/manage, xác nhận hồ sơ thuộc đúng tổ chức", () => {
    expect(route).toContain('requireApiPermission("practitioner_credentials.manage")');
    expect(route).toContain('requireApiPermission("practitioner_credentials.view")');
    expect(route).toContain("credential.organization_id !== organizationId");
  });

  it("thay/xoá file khi hồ sơ đang 'Đã ký' tự rút về 'Đã soạn' và xoá xác minh cũ (file xác minh đã đổi thì xác minh không còn đúng cho file mới)", () => {
    expect(route).toContain("function revertVerificationPatch(credential: { decision_status: string }) {");
    expect(route).toContain('if (credential.decision_status !== "DA_KY") return {};');
    expect(route).toContain('return { decision_status: "DA_SOAN", decision_verified_at: null, decision_verified_by: null };');
  });
});

describe("Liên kết physician_license_registrations ↔ practitioner_credentials", () => {
  it("POST/PATCH của physician-license registrations nhận credential_id, xác nhận thuộc đúng tổ chức trước khi gán", () => {
    const route = read("src/app/api/physician-license/registrations/route.ts");
    const idRoute = read("src/app/api/physician-license/registrations/[id]/route.ts");
    expect(route).toContain("credential_id");
    expect(route + idRoute).toContain('.from("practitioner_credentials")');
  });

  it("physician-license-client.tsx cho chọn hồ sơ năng lực hành nghề liên kết và hiển thị thông tin liên kết trên bảng", () => {
    const client = read("src/components/physician-license-client.tsx");
    expect(client).toContain("credential_id");
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
