import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
  const {data:item}=await admin.from("criteria_items").select("id,criteria_version_id,code,title,parent_criteria_item_id,is_active").eq("id",id).maybeSingle();
  if(!item)return NextResponse.json({error:"Không tìm thấy tiêu chí."},{status:404});
  const {data:version}=await admin.from("criteria_set_versions").select("id,criteria_set_id,status").eq("id",item.criteria_version_id).maybeSingle();
  if(!version)return NextResponse.json({error:"Phiên bản tiêu chí không tồn tại."},{status:404});
  const {data:set}=await admin.from("criteria_sets").select("id,organization_id").eq("id",version.criteria_set_id).maybeSingle();
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active||!set||set.organization_id!==caller.organization_id)return NextResponse.json({error:"Không có quyền cập nhật tiêu chí này."},{status:403});
  const bodyKeys=Object.keys(body).filter((key)=>key!=="is_active");
  const isActiveOnlyToggle=Object.prototype.hasOwnProperty.call(body,"is_active")&&bodyKeys.length===0;
  // Bật/ngưng sử dụng một tiêu chí lẻ không làm thay đổi nội dung/lịch sử đánh giá đã có, nên
  // được phép ngay cả khi phiên bản đã xuất bản; mọi thay đổi nội dung khác vẫn bắt buộc bản nháp mới.
  if(version.status!=="DRAFT"&&!isActiveOnlyToggle)return NextResponse.json({error:"Phiên bản đã phát hành không được sửa trực tiếp. Hãy tạo bản cập nhật mới."},{status:409});
  const patch:any={updated_at:new Date().toISOString()};
  if(Object.prototype.hasOwnProperty.call(body,"title")){const title=clean(body.title);if(!title)return NextResponse.json({error:"Tên tiêu chí không được để trống."},{status:400});patch.title=title;}
  if(Object.prototype.hasOwnProperty.call(body,"description"))patch.description=clean(body.description)||null;
  if(Object.prototype.hasOwnProperty.call(body,"code")){
    const code=clean(body.code).toUpperCase()||null;
    if(code){const {data:dup}=await admin.from("criteria_items").select("id").eq("criteria_version_id",version.id).eq("code",code).neq("id",id).maybeSingle();if(dup)return NextResponse.json({error:"Mã tiêu chí đã tồn tại trong phiên bản này."},{status:409});}
    patch.code=code;
  }
  if(Object.prototype.hasOwnProperty.call(body,"chapter_code"))patch.chapter_code=clean(body.chapter_code)||null;
  if(Object.prototype.hasOwnProperty.call(body,"chapter_name"))patch.chapter_name=clean(body.chapter_name)||null;
  if(Object.prototype.hasOwnProperty.call(body,"score_weight"))patch.score_weight=Math.max(1,Number(body.score_weight)||1);
  if(Object.prototype.hasOwnProperty.call(body,"max_score")){const raw=String(body.max_score??"").trim();patch.max_score=raw?Number(raw):null;}
  if(Object.prototype.hasOwnProperty.call(body,"is_core"))patch.is_core=body.is_core===true;
  if(Object.prototype.hasOwnProperty.call(body,"is_mandatory"))patch.is_mandatory=body.is_mandatory===true;
  if(Object.prototype.hasOwnProperty.call(body,"is_active"))patch.is_active=body.is_active===true;
  if(Object.prototype.hasOwnProperty.call(body,"sequence_no"))patch.sequence_no=Math.max(1,Number(body.sequence_no)||1);
  const {error}=await admin.from("criteria_items").update(patch).eq("id",id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(body.is_active===false&&item.parent_criteria_item_id===null){
    await admin.from("criteria_items").update({is_active:false,updated_at:new Date().toISOString()}).eq("parent_criteria_item_id",id);
  }
  return NextResponse.json({ok:true});
}
