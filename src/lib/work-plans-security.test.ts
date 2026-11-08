import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Yêu cầu tường minh: "Áp dụng được vào qarica ok ko" -> "Xây thành tính
// năng trong QARICA" -> module mới "Kế hoạch công việc" áp dụng đủ 4 quy
// tắc: SMART (cấp kế hoạch) + 5W1H + Eisenhower + RACI (cấp đầu việc).
// Bảng riêng, KHÔNG dùng lại actions/plans (Plan Composer QLCL chính thức —
// khác nghiệp vụ, xem comment migration).
describe("Kế hoạch công việc: bảng riêng, không trùng/song song hoá actions/plans hiện có", () => {
  it("migration tạo đúng 3 bảng mới (work_plans/work_plan_items/work_plan_item_raci), không đụng vào actions/plans", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("create table if not exists public.work_plans");
    expect(migration).toContain("create table if not exists public.work_plan_items");
    expect(migration).toContain("create table if not exists public.work_plan_item_raci");
    expect(migration).not.toContain("alter table public.actions");
    expect(migration).not.toContain("alter table public.plans");
    expect(migration).not.toContain("create table if not exists public.actions");
  });

  it("work_plan_items.eisenhower_quadrant là lựa chọn trực tiếp (P1-P4, default P2), KHÔNG tính từ due_date như personal_reminders", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("eisenhower_quadrant text not null default 'P2' check (eisenhower_quadrant in ('P1','P2','P3','P4'))");
  });

  it("work_plan_item_raci chỉ chấp nhận đúng 4 vai trò R/A/C/I, unique theo (item, user, role)", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("raci_role text not null check (raci_role in ('R','A','C','I'))");
    expect(migration).toContain("unique (work_plan_item_id, user_id, raci_role)");
  });

  it("định nghĩa đúng 2 permission work_plans.view/manage, bootstrap từ tasks.view (view) và plans.manage (manage) giống procedure_training đã làm", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("('work_plans.view'");
    expect(migration).toContain("('work_plans.manage'");
    expect(migration).toContain("p_old.code='tasks.view'");
    expect(migration).toContain("p_new.code='work_plans.view'");
    expect(migration).toContain("p_old.code='plans.manage'");
    expect(migration).toContain("p_new.code='work_plans.manage'");
  });

  it("là bảng riêng — không tái dùng supabase_migrations/schema module name 'plans' đã có (tránh đụng Plan Composer)", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("'work_plans'");
  });

  it("là nhóm menu riêng trên sidebar, nhãn phân biệt rõ với 'Kế hoạch & Điều hành' (Plan Composer), gate đúng permission work_plans.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "Kế hoạch công việc", href: "/work-plans", icon: "target", permission: "work_plans.view" }');
  });
});

describe("Kế hoạch công việc: API routes tách view/manage, tenant-scoped đúng mọi route", () => {
  it("GET/POST /api/work-plans: GET=.view, POST=.manage", () => {
    const route = read("src/app/api/work-plans/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.view")');
    expect(route).toContain('requireApiPermission("work_plans.manage")');
  });

  it("PATCH/DELETE /api/work-plans/[id]: cả 2 đều .manage, tenant-scoped qua organization_id", () => {
    const route = read("src/app/api/work-plans/[id]/route.ts");
    expect((route.match(/requireApiPermission\("work_plans\.manage"\)/g) || []).length).toBe(2);
    expect(route).toContain('.eq("organization_id", organizationId)');
  });

  it("POST /api/work-plans/[id]/items: .manage, validate RACI trước khi ghi (đúng 1 A, ít nhất 1 R), xác thực user_id thuộc đúng tổ chức", () => {
    const route = read("src/app/api/work-plans/[id]/items/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.manage")');
    expect(route).toContain('if (accountableCount !== 1) return { ok: false, error: "Mỗi đầu việc phải có đúng 1 người chữ A (chịu trách nhiệm chính)." };');
    expect(route).toContain('if (responsibleCount < 1) return { ok: false, error: "Mỗi đầu việc phải có ít nhất 1 người chữ R (thực hiện)." };');
    expect(route).toContain('.eq("organization_id", organizationId).in("user_id", userIds)');
  });

  it("tạo đầu việc thất bại khi gán RACI lỗi thì xoá bù trừ đầu việc vừa tạo, không để lại đầu việc thiếu RACI", () => {
    const route = read("src/app/api/work-plans/[id]/items/route.ts");
    expect(route).toContain("await admin.from(\"work_plan_items\").delete().eq(\"id\", item.id);");
  });

  it("PATCH/DELETE /api/work-plans/[id]/items/[itemId]: cả 2 đều .manage", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/route.ts");
    expect((route.match(/requireApiPermission\("work_plans\.manage"\)/g) || []).length).toBe(2);
  });

  it("POST thêm 1 người RACI chặn thêm người A thứ 2 (trừ khi gửi kèm replace_existing để chuyển giao — xem work-plans-my-work-integration.test.ts)", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/raci/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.manage")');
    expect(route).toContain("Đầu việc đã có người chữ A — xoá vai trò A hiện tại trước khi gán người khác, hoặc chuyển giao trực tiếp.");
  });

  it("DELETE 1 vai trò RACI chặn xoá người A duy nhất hoặc người R cuối cùng", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/raci/[raciId]/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.manage")');
    expect(route).toContain('"Không thể xoá — mỗi đầu việc phải có đúng 1 người chữ A."');
    expect(route).toContain('"Không thể xoá — mỗi đầu việc phải có ít nhất 1 người chữ R."');
  });
});

describe("Kế hoạch công việc: UI áp dụng đủ SMART (kế hoạch) + 5W1H + Eisenhower + RACI (đầu việc)", () => {
  const client = read("src/components/work-plans-client.tsx");

  it("form Tạo kế hoạch có Specific (title) + Measurable (smart_measurable) + Time-bound (target_date)", () => {
    expect(client).toContain('placeholder="Mục tiêu kế hoạch (Specific)..."');
    expect(client).toContain('placeholder="Chỉ tiêu đo lường được (Measurable)..."');
    expect(client).toContain("Hạn chót (Time-bound)");
  });

  it("form Thêm đầu việc có đủ What/Why/Where/How/When", () => {
    expect(client).toContain('placeholder="Nội dung đầu việc (What)..."');
    expect(client).toContain('placeholder="Tại sao (Why)..."');
    expect(client).toContain('placeholder="Ở đâu (Where, không bắt buộc)..."');
    expect(client).toContain('placeholder="Như thế nào (How)..."');
    expect(client).toContain("Khi nào (When)");
  });

  it("nút Tạo đầu việc bị khoá cho tới khi RACI hợp lệ (đúng 1 A, ít nhất 1 R) — raciDraftValid", () => {
    expect(client).toContain('const raciDraftValid = raciDraft.filter((r) => r.raci_role === "A").length === 1 && raciDraft.some((r) => r.raci_role === "R");');
    expect(client).toContain("disabled={itemBusy || !itemTitle.trim() || !raciDraftValid}");
  });

  it("có Ma trận Eisenhower tổng hợp mọi đầu việc đang mở của mọi kế hoạch", () => {
    expect(client).toContain("const openItems = plans.flatMap((p) => p.items.filter((i) => i.status === \"OPEN\").map((i) => ({ ...i, planTitle: p.title })));");
    expect(client).toContain("Ma trận Eisenhower");
  });
});
