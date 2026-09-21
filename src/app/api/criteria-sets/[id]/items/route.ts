import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();
const numberOrNull=(value:unknown)=>{const raw=String(value??"").trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null;};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
  const title=clean(body.title),code=clean(body.code).toUpperCase()||null,parentId=clean(body.parent_criteria_item_id)||null;\n  const requestedType=clean(body.item_type).toUpperCase(); const itemType=parentId?"SUBITEM":(["CRITERION","GROUP"].includes(requestedType)?requestedType:"CRITERION");
  if(!title)return NextResponse.json({error:"Tên tiêu chí/tiểu mục là bắt buộc."},{status:400});
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ."},{status:403});
  const {data:set}=await admin.from("criteria_sets").select("id,organization_id,is_active").eq("id",id).maybeSingle();
  if(!set||set.organization_id!==caller.organization_id)return NextResponse.json({error:"Không tìm thấy bộ tiêu chí."},{status:404});
  if(!set.is_active)return NextResponse.json({error:"Bộ tiêu chí đã ngưng áp dụng."},{status:409});
  const {data:version}=await admin.from("criteria_set_versions").select("id,version_no,status").eq("criteria_set_id",id).eq("status","DRAFT").order("version_no",{ascending:false}).limit(1).maybeSingle();
  if(!version)return NextResponse.json({error:"Bộ tiêu chí chưa có phiên bản Nháp để chỉnh sửa. Hãy tạo bản cập nhật trước."},{status:409});
  if(parentId){
    const {data:parent}=await admin.from("criteria_items").select("id,criteria_version_id,parent_criteria_item_id,is_active").eq("id",parentId).maybeSingle();
    if(!parent||parent.criteria_version_id!==version.id||parent.parent_criteria_item_id)return NextResponse.json({error:"Tiêu chí cha không hợp lệ; tiểu mục chỉ được nằm dưới một tiêu chí cấp 1."},{status:400});
    if(!parent.is_active)return NextResponse.json({error:"Tiêu chí cha đã ngưng áp dụng."},{status:409});
  }
  if(code){
    const {data:dup}=await admin.from("criteria_items").select("id").eq("criteria_version_id",version.id).eq("code",code).maybeSingle();
    if(dup)return NextResponse.json({error:"Mã tiêu chí đã tồn tại trong phiên bản này."},{status:409});
  }
  let sequenceQuery=admin.from("criteria_items").select("sequence_no").eq("criteria_version_id",version.id);
  sequenceQuery=parentId?sequenceQuery.eq("parent_criteria_item_id",parentId):sequenceQuery.is("parent_criteria_item_id",null);
  const {data:existing}=await sequenceQuery.order("sequence_no",{ascending:false}).limit(1);
  const sequenceNo=Number(body.sequence_no)||((Number(existing?.[0]?.sequence_no)||0)+10);
  const {data:item,error}=await admin.from("criteria_items").insert({
    criteria_version_id:version.id,code,title,description:clean(body.description)||null,sequence_no:sequenceNo,
    chapter_code:clean(body.chapter_code)||null,chapter_name:clean(body.chapter_name)||null,
    score_weight:Math.max(1,Number(body.score_weight)||1),is_core:body.is_core===true,is_mandatory:body.is_mandatory===true,
    max_score:numberOrNull(body.max_score),parent_criteria_item_id:parentId,item_type:itemType,is_active:true,updated_at:new Date().toISOString()
  }).select("id,code,title,parent_criteria_item_id,item_type,sequence_no").single();
  if(error||!item)return NextResponse.json({error:error?.message||"Không tạo được tiêu chí."},{status:400});
  return NextResponse.json({ok:true,item});
}
