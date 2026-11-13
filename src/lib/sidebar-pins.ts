import { createClient } from "@/lib/supabase/client";

/**
 * Ghim/bỏ ghim mục menu sidebar — ưu tiên cá nhân, đồng bộ qua mọi thiết bị
 * (bảng sidebar_pinned_items, RLS theo auth.uid(), cùng kiểu với
 * personal_reminders). Gọi thẳng Supabase client từ phía trình duyệt, dựa
 * vào RLS để chặn, không cần route API riêng — đúng quy ước đã có sẵn ở
 * personal-reminders.tsx (không phải mọi thao tác cá nhân đều cần 1 route
 * API riêng khi RLS đã đủ chặt).
 */
export async function listSidebarPins(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sidebar_pinned_items")
    .select("nav_route")
    .eq("owner_user_id", userId)
    .order("sort_order");
  return (data ?? []).map((row: { nav_route: string }) => row.nav_route);
}

export async function pinSidebarRoute(userId: string, organizationId: string, navRoute: string, sortOrder: number) {
  const supabase = createClient();
  return supabase.from("sidebar_pinned_items").insert({
    owner_user_id: userId,
    organization_id: organizationId,
    nav_route: navRoute,
    sort_order: sortOrder,
  });
}

export async function unpinSidebarRoute(userId: string, navRoute: string) {
  const supabase = createClient();
  return supabase.from("sidebar_pinned_items").delete().eq("owner_user_id", userId).eq("nav_route", navRoute);
}
