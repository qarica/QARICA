import { PageHeader } from "@/components/page-header";
import { LabSuppliesClient } from "@/components/lab-supplies-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { KIND_CATEGORIES, KIND_DESCRIPTION, KIND_LABEL, todayInVietnam, type SupplyKind } from "@/lib/lab-supplies";
import { ITEM_SELECT, LOT_BALANCE_SELECT, MOVEMENT_SELECT } from "@/lib/lab-supplies-api";
import { fetchAllPages } from "@/lib/lab-supplies-paging";
import { createClient } from "@/lib/supabase/server";

// Trang dùng chung cho Kho hóa chất và Kho vật tư: cùng bảng lab_supply_*, chỉ lọc theo nhóm hàng (KIND_CATEGORIES).
export async function LabSuppliesKindPage({ kind }: { kind: SupplyKind }) {
  const { user } = await requireUserContext();
  requirePermission(user, "lab_supplies.view");
  const canManage = hasPermission(user, "lab_supplies.manage");
  const supabase = await createClient();

  const [itemsRes, lotsRes, movementsRes, closingsRes] = await Promise.all([
    // Phân trang để không bị cắt âm thầm ở 1.000 dòng (xem lab-supplies-paging.ts).
    fetchAllPages((from, to) => supabase.from("lab_supply_items").select(ITEM_SELECT).eq("organization_id", user.organizationId).in("category", KIND_CATEGORIES[kind]).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    // Chỉ lô còn tồn: số tồn luôn là tổng sổ xuất nhập (view), không lưu cột tồn.
    fetchAllPages((from, to) => supabase.from("lab_supply_lot_balances").select(LOT_BALANCE_SELECT).eq("organization_id", user.organizationId).gt("balance", 0).order("lot_id", { ascending: true }).range(from, to)),
    supabase
      .from("lab_supply_movements")
      .select(MOVEMENT_SELECT)
      .eq("organization_id", user.organizationId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("lab_supply_period_closings").select("id,period_end,note,created_at").eq("organization_id", user.organizationId).order("period_end", { ascending: false }).limit(1),
  ]);

  const items = (itemsRes.data ?? []) as any[];
  const itemIds = new Set(items.map((i) => i.id));
  const lots = ((lotsRes.data ?? []) as any[]).filter((l) => itemIds.has(l.item_id));
  const movements = ((movementsRes.data ?? []) as any[]).filter((m) => itemIds.has(m.item_id)).slice(0, 300);
  const actorIds = Array.from(new Set(movements.map((m) => m.created_by).filter(Boolean)));
  const profilesRes = actorIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", actorIds) : { data: [] as any[] };
  const actorName: Record<string, string> = {};
  for (const p of (profilesRes.data ?? []) as any[]) actorName[p.user_id] = p.full_name || p.email || "";

  const loadError = itemsRes.error || lotsRes.error || movementsRes.error || closingsRes.error;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="KHOA XÉT NGHIỆM" title={KIND_LABEL[kind]} description={KIND_DESCRIPTION[kind]} icon={kind === "chemical" ? "droplets" : "archive"} />
      {loadError ? <div className="alert error">Không tải được dữ liệu kho: {loadError.message}</div> : null}
      <LabSuppliesClient
        supplyKind={kind}
        items={items}
        lots={lots}
        movements={movements.map((m) => ({ ...m, actor_name: actorName[m.created_by] || "" }))}
        lastClosing={((closingsRes.data ?? [])[0] ?? null) as any}
        today={todayInVietnam()}
        canManage={canManage}
      />
    </div>
  );
}
