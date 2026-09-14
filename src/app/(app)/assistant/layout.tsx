import { requirePermission, requireUserContext } from "@/lib/auth";

export default async function AssistantLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUserContext();
  requirePermission(user, "dashboard.view");
  return children;
}
