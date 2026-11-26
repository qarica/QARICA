import { PageHeader } from "@/components/page-header";
import { LabSuppliesClient } from "@/components/lab-supplies-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { todayInVietnam } from "@/lib/lab-supplies";
import { ITEM_SELECT, LOT_BALANCE_SELECT, MOVEMENT_SELECT } from "@/lib/lab-supplies-api";
import { createClient } from "@/lib/supabase/server";

export default async function LabSuppliesPage() {
  const { user } = await requireUserContext();
  requirePermission(user, "lab_supplies.view");
  const canManage = hasPermission(user, "lab_supplies.manage");
  const supabase = await createClient();

  const [itemsRes, lotsRes, movementsRes, closingsRes] = await Promise.all([
    supabase.from("lab_supply_items").select(ITEM_SELECT).eq("organization_id", user.organizationId).order("code", { ascending: true }),
    // Chỉ lô còn tồn: số tồn luôn là tổng sổ xuất nhập (view), không lưu cột tồn.
    supabase.from("lab_supply_lot_balances").select(LOT_BALANCE_SELECT).eq("organization_id", user.organizationId).gt("balance", 0).limit(2000),
    supabase
      .from("lab_supply_movements")
      .select(MOVEMENT_SELECT)
      .eq("organization_id", user.organizationId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("lab_supply_period_closings").select("id,period_end,note,created_at").eq("organization_id", user.organizationId).order("period_end", { ascending: false }).limit(1),
  ]);

  const movements = (movementsRes.data ?? []) as any[];
  const actorIds = Array.from(new Set(movements.map((m) => m.created_by).filter(Boolean)));
  const profilesRes = actorIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", actorIds) : { data: [] as any[] };
  const actorName: Record<string, string> = {};
  for (const p of (profilesRes.data ?? []) as any[]) actorName[p.user_id] = p.full_name || p.email || "";

  const loadError = itemsRes.error || lotsRes.error || movementsRes.error || closingsRes.error;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="KHOA XÉT NGHIỆM"
        title="Kho hóa chất & VTYT xét nghiệm"
        description="Nhập – xuất – tồn theo lô và hạn dùng, cảnh báo sắp hết/sắp hết hạn, kiểm kê, hao hụt, hủy hàng hết hạn và chốt kỳ."
        icon="droplets"
      />
      {loadError ? <div className="alert error">Không tải được dữ liệu kho: {loadError.message}</div> : null}
      <LabSuppliesClient
        items={(itemsRes.data ?? []) as any[]}
        lots={(lotsRes.data ?? []) as any[]}
        movements={movements.map((m) => ({ ...m, actor_name: actorName[m.created_by] || "" }))}
        lastClosing={((closingsRes.data ?? [])[0] ?? null) as any}
        today={todayInVietnam()}
        canManage={canManage}
      />
    </div>
  );
}
