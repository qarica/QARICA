import { AppShell } from "@/components/app-shell";
import { GlobalRecordLifecycleActions } from "@/components/global-record-lifecycle-actions";
import { requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const {user,organization}=await requireUserContext();
  const navGroups=visibleNavGroups(user);
  const year=await getWorkYear();
  // Ghim menu sidebar (Stage A: sidebar_pinned_items, RLS theo auth.uid()) —
  // đọc qua client thường (không phải admin) để RLS tự lọc đúng người dùng,
  // giống mọi ưu tiên cá nhân khác trong app.
  const supabase = await createClient();
  const { data: pinnedRows } = await supabase.from("sidebar_pinned_items").select("nav_route").eq("owner_user_id", user.id).order("sort_order");
  const pinnedRoutes = (pinnedRows ?? []).map((row) => row.nav_route);
  return <AppShell user={user} organization={organization} navGroups={navGroups} year={year} pinnedRoutes={pinnedRoutes}>
    {children}
    <GlobalRecordLifecycleActions />
  </AppShell>;
}
