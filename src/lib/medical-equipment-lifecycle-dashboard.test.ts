import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Bổ sung Sổ quản lý TTBYT theo yêu cầu người dùng (tham khảo mẫu quản lý tài
// sản CNTT: QR tra cứu, cấp phát/thu hồi/bàn giao, theo dõi bảo trì, dashboard,
// xuất Excel — bỏ phần đồng bộ Active Directory vì không áp dụng cho TTBYT).
describe("Migration: status 3 mức thay is_active, bảng medical_equipment_events", () => {
  const migration = read("supabase/migrations/20261115000000_medical_equipment_lifecycle_v1.sql");

  it("thêm cột status (not null, default IN_USE) + check constraint 3 giá trị", () => {
    expect(migration).toContain("alter table public.medical_equipment add column if not exists status text;");
    expect(migration).toContain("alter table public.medical_equipment alter column status set not null;");
    expect(migration).toContain("alter table public.medical_equipment alter column status set default 'IN_USE';");
    expect(migration).toContain("check (status in ('IN_USE','MAINTENANCE','INACTIVE'));");
  });

  it("backfill từ is_active cũ (true->IN_USE, false->INACTIVE) trước khi set not null", () => {
    expect(migration).toContain("update public.medical_equipment set status = case when is_active then 'IN_USE' else 'INACTIVE' end where status is null;");
  });

  it("KHÔNG tự nhận đã drop is_active trên production chỉ vì có trong file — ghi rõ lý do chưa drop được", () => {
    expect(migration).not.toContain("drop column if exists is_active");
    expect(migration).toContain("CHƯA drop được");
  });

  it("tạo bảng medical_equipment_events với đủ cột vòng đời + RLS theo organization_id", () => {
    expect(migration).toContain("create table if not exists public.medical_equipment_events");
    expect(migration).toContain("event_type text not null check (event_type in ('ASSIGN','TRANSFER','RETURN','MAINTENANCE_START','MAINTENANCE_DONE','NOTE'))");
    expect(migration).toContain("to_department_id uuid references public.departments(id)");
    expect(migration).toContain("alter table public.medical_equipment_events enable row level security");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
  });
});

describe("API /api/medical-equipment — dùng status thay is_active", () => {
  it("GET: lọc INACTIVE qua status, SELECT của medical_equipment không còn cột is_active (departments.is_active vẫn còn, khác bảng)", () => {
    const route = read("src/app/api/medical-equipment/route.ts");
    const selectLine = route.split("\n").find((l) => l.startsWith("const SELECT =")) || "";
    expect(selectLine).not.toContain("is_active");
    expect(selectLine).toContain("status");
    expect(route).toContain('query = query.neq("status", "INACTIVE");');
    expect(route).toContain('.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true)');
  });

  it("PATCH: nhận status hợp lệ (IN_USE/MAINTENANCE/INACTIVE), từ chối giá trị lạ", () => {
    const route = read("src/app/api/medical-equipment/[id]/route.ts");
    expect(route).toContain('new Set(["IN_USE", "MAINTENANCE", "INACTIVE"])');
    expect(route).toContain("Trạng thái không hợp lệ.");
    expect(route).not.toContain("patch.is_active = body.is_active === true;");
  });
});

describe("API /api/medical-equipment/[id]/events — lịch sử bàn giao/bảo trì", () => {
  const route = read("src/app/api/medical-equipment/[id]/events/route.ts");

  it("GET dùng medical_equipment.view, xác nhận thiết bị thuộc đúng tổ chức", () => {
    expect(route).toContain('requireApiPermission("medical_equipment.view")');
    expect(route).toContain("equipment.organization_id !== organizationId");
  });

  it("POST dùng medical_equipment.manage, validate event_type và to_department_id thuộc đúng tổ chức", () => {
    expect(route).toContain('requireApiPermission("medical_equipment.manage")');
    expect(route).toContain("Loại sự kiện không hợp lệ.");
    expect(route).toContain('.eq("id", toDepartmentId).eq("organization_id", organizationId).eq("is_active", true)');
  });

  it("ASSIGN/TRANSFER có to_department_id đồng bộ department_id; MAINTENANCE_START/DONE đồng bộ status — RETURN/NOTE chỉ ghi log", () => {
    expect(route).toContain('(eventType === "ASSIGN" || eventType === "TRANSFER") && toDepartmentId) equipmentPatch.department_id = toDepartmentId;');
    expect(route).toContain('eventType === "MAINTENANCE_START") equipmentPatch.status = "MAINTENANCE";');
    expect(route).toContain('eventType === "MAINTENANCE_DONE") equipmentPatch.status = "IN_USE";');
  });

  it("ghi audit_logs cho sự kiện vừa tạo", () => {
    expect(route).toContain('action_type: "MEDICAL_EQUIPMENT_EVENT_CREATE"');
  });
});

describe("API /api/medical-equipment/export — xuất Excel (CSV BOM, đúng quy ước đã dùng ở hsba-audit export)", () => {
  const route = read("src/app/api/medical-equipment/export/route.ts");

  it("dùng medical_equipment.view, trả về CSV có BOM để Excel mở đúng dấu tiếng Việt", () => {
    expect(route).toContain('requireApiPermission("medical_equipment.view")');
    expect(route).toContain('"Content-Type": "text/csv; charset=utf-8"');
    expect(route).toContain('const bom = "﻿";');
  });
});

describe("Trang chi tiết /medical-equipment/[id] — QR tra cứu + lịch sử", () => {
  it("page.tsx chặn bằng medical_equipment.view, 404 nếu thiết bị không thuộc tổ chức", () => {
    const page = read("src/app/(app)/medical-equipment/[id]/page.tsx");
    expect(page).toContain('requirePermission(user, "medical_equipment.view")');
    expect(page).toContain(".eq(\"organization_id\", user.organizationId)");
    expect(page).toContain("if (!equipment) notFound();");
  });

  it("detail client tạo QR bằng thư viện qrcode, mã hoá đúng link tới trang chi tiết của chính thiết bị đó", () => {
    const client = read("src/components/medical-equipment-detail-client.tsx");
    expect(client).toContain('import QRCode from "qrcode";');
    expect(client).toContain("QRCode.toDataURL(url");
    expect(client).toContain("`${window.location.origin}/medical-equipment/${equipment.id}`");
  });

  it("form thêm sự kiện chỉ hiện cho canManage, POST tới /api/medical-equipment/[id]/events", () => {
    const client = read("src/components/medical-equipment-detail-client.tsx");
    expect(client).toContain("{canManage ? (");
    expect(client).toContain("Thêm sự kiện");
    expect(client).toContain("fetch(`/api/medical-equipment/${equipment.id}/events`");
  });

  it("qrcode là dependency thực sự trong package.json, không phải tự chế thuật toán QR", () => {
    const pkg = read("package.json");
    expect(pkg).toMatch(/"qrcode":\s*"\^1\./);
  });
});

// Phát hiện thực tế: page.tsx (trang danh sách) tự truy vấn Supabase trực
// tiếp, KHÔNG qua /api/medical-equipment — nên khi thêm cột status, sửa 2 API
// route + trang chi tiết nhưng quên sửa đúng SELECT này, dashboard luôn đếm 0
// vì mọi equipment.status đều undefined (trong khi badge trạng thái ở trang
// chi tiết lại đúng, vì page.tsx của trang đó có SELECT status riêng, đã sửa
// đúng từ đầu) — dễ gây hiểu lầm "chỉ dashboard sai, bảng/badge vẫn đúng".
// Khoá lại CẢ 2 page.tsx (danh sách + chi tiết) để không lặp lại.
describe("Cả 2 page.tsx (danh sách + chi tiết) đều SELECT đúng cột status của medical_equipment, không còn is_active", () => {
  it("trang danh sách (/medical-equipment) SELECT status, không còn is_active của medical_equipment", () => {
    const page = read("src/app/(app)/medical-equipment/page.tsx");
    const equipmentSelectCall = page.split("\n").find((l) => l.includes('.from("medical_equipment")')) ? page.match(/\.from\("medical_equipment"\)\s*\n?\s*\.select\("([^"]+)"\)/) : null;
    const selectCols = equipmentSelectCall ? equipmentSelectCall[1] : "";
    expect(selectCols).toContain("status");
    expect(selectCols).not.toContain("is_active");
  });

  it("trang chi tiết (/medical-equipment/[id]) SELECT status, không còn is_active của medical_equipment", () => {
    const page = read("src/app/(app)/medical-equipment/[id]/page.tsx");
    const equipmentSelectCall = page.match(/\.from\("medical_equipment"\)\s*\n?\s*\.select\("([^"]+)"\)/);
    const selectCols = equipmentSelectCall ? equipmentSelectCall[1] : "";
    expect(selectCols).toContain("status");
    expect(selectCols).not.toContain("is_active");
  });
});

describe("Danh sách /medical-equipment — dashboard tổng quan + liên kết sang trang chi tiết", () => {
  const client = read("src/components/medical-equipment-client.tsx");

  it("dashboard tính trên toàn bộ initialEquipment (không phụ thuộc bộ lọc bảng), dùng TqmDonut/TqmHorizontalBars đã có sẵn", () => {
    expect(client).toContain('import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars } from "@/components/tqm-charts";');
    expect(client).toContain("const dashboard = useMemo(() => {");
    expect(client).toContain("const total = initialEquipment.length;");
  });

  it("mỗi dòng có liên kết Chi tiết sang /medical-equipment/[id]", () => {
    expect(client).toContain('href={`/medical-equipment/${e.id}`}');
  });

  it("có nút Xuất Excel trỏ tới route export", () => {
    expect(client).toContain('href="/api/medical-equipment/export"');
  });

  it("3 trạng thái hiện đúng nhãn/tone: Đang sử dụng (success), Bảo trì/Sửa chữa (warning), Ngưng sử dụng (muted)", () => {
    expect(client).toContain('IN_USE: "success", MAINTENANCE: "warning", INACTIVE: "muted"');
  });
});
