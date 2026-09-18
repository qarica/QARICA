import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth";

export default async function LegacyWorkGroupsPage(){
  const {user}=await requireUserContext();
  if(user.permissions.includes("users.manage")) redirect("/admin/user-groups");
  redirect("/dashboard?forbidden=1");
}
