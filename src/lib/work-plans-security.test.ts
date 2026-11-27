import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Yêu cầu tường minh: "Áp dụng được vào qarica ok ko" -> "Xây thành tính
// năng trong QARICA" -> module mới "Kế hoạch công việc" áp dụng đủ 4 quy
// tắc: SMART (cấp kế hoạch) + 5W1H + Eisenhower + người phụ trách (cấp đầu việc; RACI đã bỏ).
// Bảng riêng, KHÔNG dùng lại actions/plans (Plan Composer QLCL chính thức —
// khác nghiệp vụ, xem comment migration).
describe("Kế hoạch công việc: bảng riêng, không trùng/song song hoá actions/plans hiện có", () => {
  it("migration v1 tạo các bảng work_plans/work_plan_items (+ bảng RACI cũ đã bỏ ở migration 20261202000008), không đụng vào actions/plans", () => {
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

  it("RACI đã bỏ: migration 20261202000008 thêm assignee_user_id (1 người phụ trách/đầu việc) và xóa bảng work_plan_item_raci", () => {
    const m = read("supabase/migrations/20261202000008_work_plan_single_assignee_v1.sql");
    expect(m).toContain("add column if not exists assignee_user_id uuid references auth.users(id)");
    expect(m).toContain("drop table if exists public.work_plan_item_raci;");
  });

  it("là bảng riêng — không tái dùng supabase_migrations/schema module name 'plans' đã có (tránh đụng Plan Composer)", () => {
    const migration = read("supabase/migrations/20261127000000_work_plans_v1.sql");
    expect(migration).toContain("'work_plans'");
  });

  // Explicit request (2026-11-13): "Xoá luôn menu kế hoạch công việc" — the
  // sidebar entry point is removed; /work-plans and its API/table are left
  // untouched and still work, just unreachable from the sidebar now.
  it("không còn nhóm menu 'Kế hoạch công việc' trên sidebar, nhưng route/API /work-plans vẫn còn nguyên", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).not.toContain('id: "work-plans"');
    expect(nav).not.toContain('href: "/work-plans"');
    const route = read("src/app/api/work-plans/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.view")');
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

  it("POST /api/work-plans/[id]/items: .manage, bắt buộc 1 người phụ trách thuộc đúng tổ chức, không còn RACI", () => {
    const route = read("src/app/api/work-plans/[id]/items/route.ts");
    expect(route).toContain('requireApiPermission("work_plans.manage")');
    expect(route).toContain('Chưa chọn người phụ trách đầu việc.');
    expect(route).toContain('.eq("organization_id", organizationId).eq("user_id", assigneeId)');
    expect(route).toContain("assignee_user_id: assigneeId");
    expect(route.toLowerCase()).not.toContain("raci");
  });

  it("PATCH/DELETE /api/work-plans/[id]/items/[itemId]: cả 2 đều .manage", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/route.ts");
    expect((route.match(/requireApiPermission\("work_plans\.manage"\)/g) || []).length).toBe(2);
  });

  it("PATCH item đổi người phụ trách: kiểm tra người mới thuộc đúng tổ chức; không còn route RACI", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/route.ts");
    expect(route).toContain('field === "assignee_user_id"');
    expect(route).toContain("Người phụ trách không thuộc tổ chức của bạn.");
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/work-plans/[id]/items/[itemId]/raci"))).toBe(false);
  });
});

describe("Kế hoạch công việc: UI áp dụng đủ SMART (kế hoạch) + 5W1H + Eisenhower + người phụ trách (đầu việc)", () => {
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

  it("nút Tạo đầu việc bị khoá cho tới khi chọn người phụ trách; UI không còn RACI", () => {
    expect(client).toContain("disabled={itemBusy || !itemTitle.trim() || !itemAssignee}");
    expect(client).toContain("Người phụ trách *");
    expect(client.toLowerCase()).not.toContain("raci");
  });

  it("có Ma trận Eisenhower tổng hợp mọi đầu việc đang mở của mọi kế hoạch", () => {
    expect(client).toContain("const openItems = plans.flatMap((p) => p.items.filter((i) => i.status === \"OPEN\").map((i) => ({ ...i, planTitle: p.title })));");
    expect(client).toContain("Ma trận Eisenhower");
  });
});
