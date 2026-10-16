import { AppShell } from "@/components/app-shell";
import { GlobalQuickCapture } from "@/components/global-quick-capture";
import { GlobalRecordLifecycleActions } from "@/components/global-record-lifecycle-actions";
import { requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";
import { getWorkYear } from "@/lib/work-year";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const {user,organization}=await requireUserContext();
  const navGroups=visibleNavGroups(user);
  const year=await getWorkYear();
  return <AppShell user={user} organization={organization} navGroups={navGroups} year={year}>
    {children}
    <GlobalRecordLifecycleActions />
    <GlobalQuickCapture userId={user.id} organizationId={user.organizationId} />
  </AppShell>;
}
