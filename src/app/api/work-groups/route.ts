import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLE_SET = new Set(["LEADER","DEPUTY","SECRETARY","MEMBER"]);
const TYPE_SET = new Set(["WORKING_GROUP","AUDIT_TEAM","ASSESSMENT_TEAM","RCA_TEAM","IMPROVEMENT_TEAM","MONITORING_TEAM","OTHER"]);
const text = (v: unknown) => String(v ?? "").trim() || null;

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok:false as const, response:NextResponse.json({error:"Chưa đăng nhập."},{status:401}) };
  const { data: allowed } = await supabase.rpc("has_permission",{p_permission_code:"plans.manage"});
  if (!allowed) return { ok:false as const, response:NextResponse.json({error:"Bạn không có quyền quản lý Nhóm công tác."},{status:403}) };
  const admin=createAdminClient();
  const { data: profile }=await admin.from("profiles").select("organization_id,is_active").eq("user_id",user.id).maybeSingle();
  if(!profile?.organization_id||!profile.is_active)return {ok:false as const,response:NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403})};
  return {ok:true as const,user,admin,organizationId:profile.organization_id};
}

export async function POST(request:Request){
  const c=await ctx(); if(!c.ok)return c.response;
  const b=await request.json();
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

  const {data:group,error:gerr}=await c.admin.from("work_groups").insert({
    organization_id:c.organizationId,code,name,group_type:groupType,description:text(b.description),
    lead_department_id:leadDepartmentId,leader_user_id:leaderUserId,valid_from:validFrom,valid_to:validTo,
    is_active:b.is_active!==false,created_by:c.user.id,
  }).select("id").single();
  if(gerr||!group)return NextResponse.json({error:gerr?.message||"Không tạo được nhóm."},{status:400});

  const rows=userIds.map((userId)=>{
    const supplied=members.find((x:any)=>String(x.user_id||"")===userId);
    let role=String(supplied?.member_role||"MEMBER").toUpperCase();
    if(userId===leaderUserId)role="LEADER";
    if(!ROLE_SET.has(role))role="MEMBER";
    return {group_id:group.id,user_id:userId,member_role:role,is_active:true,joined_at:validFrom};
  });
  if(rows.length){
    const {error:merr}=await c.admin.from("work_group_members").insert(rows);
    if(merr){await c.admin.from("work_groups").delete().eq("id",group.id);return NextResponse.json({error:merr.message},{status:400});}
  }
  return NextResponse.json({ok:true,id:group.id});
}
