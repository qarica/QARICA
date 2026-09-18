import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLE_SET = new Set(["LEADER","DEPUTY","SECRETARY","MEMBER"]);
const TYPE_SET = new Set(["WORKING_GROUP","AUDIT_TEAM","ASSESSMENT_TEAM","RCA_TEAM","IMPROVEMENT_TEAM","MONITORING_TEAM","OTHER"]);
const text = (v: unknown) => String(v ?? "").trim() || null;

async function ctx(id:string){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {ok:false as const,response:NextResponse.json({error:"Chưa đăng nhập."},{status:401})};
  const {data:allowed}=await supabase.rpc("has_permission",{p_permission_code:"plans.manage"});
  if(!allowed)return {ok:false as const,response:NextResponse.json({error:"Bạn không có quyền quản lý Nhóm công tác."},{status:403})};
  const admin=createAdminClient();
  const {data:profile}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",user.id).maybeSingle();
  if(!profile?.organization_id||!profile.is_active)return {ok:false as const,response:NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403})};
  const {data:group}=await admin.from("work_groups").select("id,organization_id").eq("id",id).maybeSingle();
  if(!group||group.organization_id!==profile.organization_id)return {ok:false as const,response:NextResponse.json({error:"Nhóm không tồn tại hoặc ngoài bệnh viện."},{status:404})};
  return {ok:true as const,user,admin,organizationId:profile.organization_id};
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const c=await ctx(id); if(!c.ok)return c.response;
  const b=await request.json();
  if(String(b.command||"").toUpperCase()==="TOGGLE_ACTIVE"){
    const {data:current}=await c.admin.from("work_groups").select("is_active").eq("id",id).maybeSingle();
    const {error}=await c.admin.from("work_groups").update({is_active:!current?.is_active,updated_at:new Date().toISOString()}).eq("id",id);
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  const name=text(b.name), code=text(b.code), groupType=String(b.group_type||"WORKING_GROUP").toUpperCase();
  const leadDepartmentId=text(b.lead_department_id), leaderUserId=text(b.leader_user_id);
  const validFrom=text(b.valid_from), validTo=text(b.valid_to);
  const members=Array.isArray(b.members)?b.members:[];
  if(!name)return NextResponse.json({error:"Tên nhóm là bắt buộc."},{status:400});
  if(!TYPE_SET.has(groupType))return NextResponse.json({error:"Loại nhóm không hợp lệ."},{status:400});
  if(validFrom&&validTo&&validTo<validFrom)return NextResponse.json({error:"Ngày hết hiệu lực không được trước ngày bắt đầu."},{status:400});

  if(leadDepartmentId){
    const {data:d}=await c.admin.from("departments").select("id").eq("id",leadDepartmentId).eq("organization_id",c.organizationId).eq("is_active",true).maybeSingle();
    if(!d)return NextResponse.json({error:"Khoa/phòng đầu mối không hợp lệ."},{status:400});
  }
  const userIds=Array.from(new Set(members.map((x:any)=>String(x.user_id||"").trim()).filter(Boolean)));
  if(leaderUserId&&!userIds.includes(leaderUserId))userIds.unshift(leaderUserId);
  if(userIds.length){
    const {data:profiles}=await c.admin.from("profiles").select("user_id").in("user_id",userIds).eq("organization_id",c.organizationId).eq("is_active",true);
    if((profiles??[]).length!==userIds.length)return NextResponse.json({error:"Có thành viên nhóm không hợp lệ."},{status:400});
  }

  const {error:gerr}=await c.admin.from("work_groups").update({
    code,name,group_type:groupType,description:text(b.description),lead_department_id:leadDepartmentId,
    leader_user_id:leaderUserId,valid_from:validFrom,valid_to:validTo,is_active:b.is_active!==false,
    updated_at:new Date().toISOString(),
  }).eq("id",id);
  if(gerr)return NextResponse.json({error:gerr.message},{status:400});

  const existing=await c.admin.from("work_group_members").select("id,user_id").eq("group_id",id);
  const existingMap=new Map((existing.data??[]).map((x:any)=>[x.user_id,x.id]));
  const keep=new Set(userIds);
  for(const row of existing.data??[]){
    if(!keep.has((row as any).user_id)){
      const {error}=await c.admin.from("work_group_members").update({is_active:false,left_at:new Date().toISOString().slice(0,10),updated_at:new Date().toISOString()}).eq("id",(row as any).id);
      if(error)return NextResponse.json({error:error.message},{status:400});
    }
  }
  for(const userId of userIds){
    const supplied=members.find((x:any)=>String(x.user_id||"")===userId);
    let role=String(supplied?.member_role||"MEMBER").toUpperCase();
    if(userId===leaderUserId)role="LEADER";
    if(!ROLE_SET.has(role))role="MEMBER";
    const memberId=existingMap.get(userId);
    if(memberId){
      const {error}=await c.admin.from("work_group_members").update({member_role:role,is_active:true,left_at:null,joined_at:validFrom,updated_at:new Date().toISOString()}).eq("id",memberId);
      if(error)return NextResponse.json({error:error.message},{status:400});
    }else{
      const {error}=await c.admin.from("work_group_members").insert({group_id:id,user_id:userId,member_role:role,is_active:true,joined_at:validFrom});
      if(error)return NextResponse.json({error:error.message},{status:400});
    }
  }

  return NextResponse.json({ok:true});
}
