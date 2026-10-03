import { AppShell } from "@/components/app-shell";
import { GlobalBackBar } from "@/components/global-back-bar";
import { GlobalRecordLifecycleActions } from "@/components/global-record-lifecycle-actions";
import { requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";
import { getWorkYear } from "@/lib/work-year";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const {user,organization}=await requireUserContext();
  const navGroups=visibleNavGroups(user);
  const year=await getWorkYear();
  return <AppShell user={user} organization={organization} navGroups={navGroups} year={year}>
    <GlobalBackBar />
    {children}
    <GlobalRecordLifecycleActions />
  </AppShell>;
}
