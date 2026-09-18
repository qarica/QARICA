"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type WorkGroupOption={
  id:string;
  label:string;
  description:string;
  memberUserIds:string[];
  leaderUserId:string|null;
  leadDepartmentId:string|null;
};

export async function loadWorkGroupOptions(organizationId:string):Promise<WorkGroupOption[]>{
  const admin=createAdminClient();
  const {data:groups,error}=await admin.from("work_groups")
    .select("id,code,name,group_type,lead_department_id,leader_user_id,valid_from,valid_to,is_active")
    .eq("organization_id",organizationId).eq("is_active",true).order("name");
  if(error||!groups?.length)return [];
  const ids=groups.map((x:any)=>x.id);
  const {data:members}=await admin.from("work_group_members").select("group_id,user_id,member_role,is_active").in("group_id",ids).eq("is_active",true);
  const byGroup=new Map<string,string[]>();
  for(const row of members??[]){
    const key=String((row as any).group_id);
    byGroup.set(key,[...(byGroup.get(key)||[]),String((row as any).user_id)]);
  }
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
  return (groups as any[])
    .filter((g)=>!(g.valid_from&&g.valid_from>today)&&!(g.valid_to&&g.valid_to<today))
    .map((g)=>({
      id:g.id,
      label:[g.code,g.name].filter(Boolean).join(" · "),
      description:[g.group_type,String(byGroup.get(g.id)?.length||0)+" thành viên"].join(" · "),
      memberUserIds:Array.from(new Set(byGroup.get(g.id)||[])),
      leaderUserId:g.leader_user_id||null,
      leadDepartmentId:g.lead_department_id||null,
    }));
}
