import { PageHeader } from "@/components/page-header";
import { WorkPlansClient } from "@/components/work-plans-client";
import { hasPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function WorkPlansPage() {
  const { user } = await requireUserContext();
  const canManage = hasPermission(user, "work_plans.manage");
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("work_plans")
    .select("id,title,smart_measurable,target_date,status,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const planIds = (plans ?? []).map((p) => p.id);
  const { data: items } = planIds.length
    ? await supabase
        .from("work_plan_items")
        .select("id,work_plan_id,title,why_text,where_text,how_text,due_date,eisenhower_quadrant,status,created_at")
        .in("work_plan_id", planIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: raci } = itemIds.length
    ? await supabase.from("work_plan_item_raci").select("id,work_plan_item_id,user_id,raci_role").in("work_plan_item_id", itemIds)
    : { data: [] as any[] };

  // Roster đầy đủ nhân sự đang hoạt động của tổ chức để chọn người gán RACI
  // — cùng cách document-publications/procedure-trainings đã làm cho roster
  // tương tự (ackCount/unconfirmedStaff).
  const { data: staff } = await supabase.from("profiles").select("user_id,full_name,email").eq("organization_id", user.organizationId).eq("is_active", true).order("full_name");
  const staffRoster = ((staff ?? []) as any[]).map((p) => ({ id: p.user_id, name: p.full_name || p.email || p.user_id }));

  const raciByItem = new Map<string, any[]>();
  for (const r of raci ?? []) {
    const list = raciByItem.get((r as any).work_plan_item_id) ?? [];
    list.push(r);
    raciByItem.set((r as any).work_plan_item_id, list);
  }
  const itemsByPlan = new Map<string, any[]>();
  for (const i of items ?? []) {
    const list = itemsByPlan.get((i as any).work_plan_id) ?? [];
    list.push({ ...i, raci: raciByItem.get((i as any).id) ?? [] });
    itemsByPlan.set((i as any).work_plan_id, list);
  }
  const plansWithItems = (plans ?? []).map((p) => ({ ...p, items: itemsByPlan.get((p as any).id) ?? [] }));

  return (
    <div className="page-stack work-plans-page">
      <PageHeader
        title="Kế hoạch công việc"
        description="Công cụ lập kế hoạch & phối hợp nhóm nhẹ: SMART (mục tiêu) → 5W1H (đầu việc) → RACI (ai làm gì) → Eisenhower (ưu tiên xử lý)."
        icon="list-checks"
      />
      <WorkPlansClient initialPlans={plansWithItems as any} staffRoster={staffRoster} canManage={canManage} />
    </div>
  );
}
