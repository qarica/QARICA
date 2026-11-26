import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: "Timeline ko có nút khai báo các đầu
// việc lớn và đầu việc con" — the Timeline page only ever showed an
// auto-derived rollup by EMR_CATEGORY, with no way to declare a real
// project's own top-level work items ("đầu việc lớn") and nested sub-items
// ("đầu việc con") directly. Added as a SEPARATE, user-managed structure
// (emr_timeline_milestones) alongside the existing auto rollup — the rollup
// stays untouched/derived, this is the thing a user actually creates/edits.
describe("EMR Timeline — declare đầu việc lớn / đầu việc con", () => {
  const migration = readFileSync("supabase/migrations/20261006_emr_timeline_milestones_v1.sql", "utf8");
  const listRoute = readFileSync("src/app/api/emr/timeline-milestones/route.ts", "utf8");
  const itemRoute = readFileSync("src/app/api/emr/timeline-milestones/[id]/route.ts", "utf8");
  const client = readFileSync("src/components/emr-timeline-milestones-client.tsx", "utf8");
  const page = readFileSync("src/app/(app)/emr/timeline/page.tsx", "utf8");

  it("the table supports 3 levels via a self-referencing parent_id (null = đầu việc lớn, set = giai đoạn/khoa)", () => {
    expect(migration).toContain("create table if not exists public.emr_timeline_milestones");
    expect(migration).toContain("parent_id uuid references public.emr_timeline_milestones(id) on delete cascade");
  });

  it("is organization-scoped with RLS gating reads, same pattern as emr_rollout_items/emr_binding_groups", () => {
    expect(migration).toContain("alter table public.emr_timeline_milestones enable row level security");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
  });

  it("GET requires emr.view; POST requires emr.manage", () => {
    expect(listRoute).toContain('requireApiPermission("emr.view")');
    expect(listRoute).toContain('requireApiPermission("emr.manage")');
  });

  // Báo cáo thực tế: "kế hoạch chung, giai đoạn, khoa" — cần đúng 3 cấp, đã
  // nới từ 2 lên 3 cấp (đầu việc lớn / giai đoạn / khoa), vẫn chặn cấp thứ 4.
  it("cho phép khai 3 cấp (đầu việc lớn / giai đoạn / khoa), chặn khai dưới 1 node đã ở cấp thứ 3 (sẽ thành cấp thứ 4)", () => {
    expect(listRoute).toContain("if (parent.parent_id) {");
    expect(listRoute).toContain('.select("id,parent_id").eq("id", parent.parent_id)');
    expect(listRoute).toContain("if (grandparent?.parent_id) return NextResponse.json({ error: \"Chỉ hỗ trợ 3 cấp: đầu việc lớn, giai đoạn và khoa/phòng.\" }, { status: 400 });");
  });

  it("PATCH/DELETE on a single milestone both require emr.manage and stay scoped to the caller's organization", () => {
    expect(itemRoute).toContain('requireApiPermission("emr.manage")');
    expect(itemRoute).toContain('.eq("organization_id", organizationId)');
  });

  it("the client has a create button for đầu việc lớn, and a per-row create button for đầu việc con", () => {
    expect(client).toContain("+ Thêm đầu việc lớn");
    expect(client).toContain("+ Đầu việc con");
  });

  it("only canManage can see the create/edit/delete controls — read-only users just see the list", () => {
    expect(client).toContain("{canManage ? <button type=\"button\" className=\"button primary small\" onClick={openCreateParent}>+ Thêm đầu việc lớn</button> : null}");
  });

  // 3 cấp: cuộn tiến độ Gantt phải tính trên LÁ (leaf) ở đáy cây (khoa, hoặc
  // chính giai đoạn nếu chưa có khoa con), không phải con trực tiếp — tránh
  // 1 "giai đoạn" trung gian (chưa làm) bị tính ngang hàng với từng khoa.
  it("rolls up a parent's Gantt progress/tone from LEAF descendants (any depth), not just direct children", () => {
    expect(client).toContain("const leafDescendantsOf = useCallback((node: Milestone): Milestone[] => {");
    expect(client).toContain("const kids = childrenOf[node.id] || [];");
    expect(client).toContain("if (!kids.length) return [node];");
    expect(client).toContain("return kids.flatMap(leafDescendantsOf);");
  });

  it("renders the 3rd cấp (khoa) via recursion, and only allows '+ Đầu việc con' up to depth < MAX_DEPTH (chặn tạo cấp thứ 4 từ UI)", () => {
    expect(client).toContain("const MAX_DEPTH = 2;");
    expect(client).toContain("function renderMilestoneRow(node: Milestone, depth: number): React.ReactNode {");
    expect(client).toContain("{isOpen ? kids.map((k) => renderMilestoneRow(k, depth + 1)) : null}");
    expect(client).toContain("{depth < MAX_DEPTH ? <button type=\"button\" className=\"button tertiary small\" onClick={() => openCreateChild(node.id)}>+ Đầu việc con</button> : null}");
  });

  it("deleting a top-level đầu việc lớn cascades to its đầu việc con (confirmed via FK, not application code)", () => {
    expect(itemRoute).not.toContain("delete from");
    expect(migration).toContain("on delete cascade");
  });

  it("the Timeline page renders the milestones client — the earlier auto-rollup-by-category section was removed per explicit request (manual declaration replaces it, not supplements it)", () => {
    expect(page).toContain("<EmrTimelineMilestonesClient canManage={canManage} year={year} />");
    expect(page).not.toContain("Tổng hợp theo danh mục EMR (tự động)");
  });
});
