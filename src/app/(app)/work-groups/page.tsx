import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { WorkGroupsClient } from "@/components/work-groups-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function WorkGroupsPage(){
  const {user}=await requireUserContext();
  if(!hasAnyPermission(user,["plans.view","plans.manage"]))redirect("/dashboard?forbidden=1");
  const supabase=await createClient();
  const [groupsRes,membersRes,deptsRes,profilesRes]=await Promise.all([
    supabase.from("work_groups").select("id,code,name,group_type,description,lead_department_id,leader_user_id,valid_from,valid_to,is_active,created_at,updated_at").order("is_active",{ascending:false}).order("name"),
    supabase.from("work_group_members").select("id,group_id,user_id,member_role,is_active,joined_at,left_at").order("created_at"),
    supabase.from("departments").select("id,name,short_name").eq("is_active",true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("is_active",true).order("full_name",{ascending:true,nullsFirst:false}),
  ]);
  const error=[groupsRes,membersRes,deptsRes,profilesRes].find((x)=>x.error)?.error;
  return <div className="page-stack">
    <PageHeader eyebrow="ĐIỀU HÀNH CHẤT LƯỢNG" title="Nhóm công tác" description="Tạo nhóm dùng lại khi phân công kế hoạch, Action, Audit, RCA, đánh giá và cải tiến. Thay đổi thành viên về sau không làm thay đổi snapshot của công việc cũ."/>
    {error?<div className="alert error">Không tải được dữ liệu nhóm: {error.message}</div>:null}
    <WorkGroupsClient
      canManage={user.permissions.includes("plans.manage")}
      groups={(groupsRes.data??[]) as any[]}
      members={(membersRes.data??[]) as any[]}
      departments={(deptsRes.data??[]) as any[]}
      profiles={(profilesRes.data??[]) as any[]}
    />
  </div>;
}
