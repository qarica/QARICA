import { AppShell } from "@/components/app-shell";
import { GlobalBackBar } from "@/components/global-back-bar";
import { GlobalRecordLifecycleActions } from "@/components/global-record-lifecycle-actions";
import { SidebarPendingBadges } from "@/components/sidebar-pending-badges";
import { requireUserContext } from "@/lib/auth";
import { visibleNav } from "@/lib/navigation";
import { getWorkYear } from "@/lib/work-year";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const {user,organization}=await requireUserContext();
  const nav=visibleNav(user);
  const year=await getWorkYear();
  return <AppShell user={user} organization={organization} nav={nav} year={year}>
    <SidebarPendingBadges userId={user.id} permissions={user.permissions} primaryDepartmentId={user.primaryDepartmentId} year={year} />
    <GlobalBackBar />
    {children}
    <GlobalRecordLifecycleActions />
  </AppShell>;
}
