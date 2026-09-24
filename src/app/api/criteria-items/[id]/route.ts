import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");if(!auth.ok)return auth.response;
  const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
  const bodyKeys=Object.keys(body).filter((key)=>key!=="is_active");
  const isActiveOnlyToggle=Object.prototype.hasOwnProperty.call(body,"is_active")&&bodyKeys.length===0;
  if(isActiveOnlyToggle){
    const {data:tx,error:txError}=await admin.rpc("qlcl_set_criteria_item_active_v1",{
      p_actor_user_id:auth.user.id,
      p_criteria_item_id:id,
      p_is_active:body.is_active===true,
    });
    if(txError){
      const message=rpcErrorMessage(txError,"Không cập nhật được trạng thái tiêu chí.");
      return NextResponse.json({error:message},{status:/không tìm thấy|ngoài phạm vi|không hợp lệ/i.test(message)?409:400});
    }
    return NextResponse.json({ok:true,is_active:tx?.is_active,children_deactivated:Number(tx?.children_deactivated||0),transaction:"atomic"});
  }
  const {data:item}=await admin.from("criteria_items").select("id,criteria_version_id,code,title,parent_criteria_item_id,is_active").eq("id",id).maybeSingle();
  if(!item)return NextResponse.json({error:"Không tìm thấy tiêu chí."},{status:404});
  const {data:version}=await admin.from("criteria_set_versions").select("id,criteria_set_id,status").eq("id",item.criteria_version_id).maybeSingle();
  if(!version)return NextResponse.json({error:"Phiên bản tiêu chí không tồn tại."},{status:404});
  const {data:set}=await admin.from("criteria_sets").select("id,organization_id").eq("id",version.criteria_set_id).maybeSingle();
  const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(!caller?.organization_id||!caller.is_active||!set||set.organization_id!==caller.organization_id)return NextResponse.json({error:"Không có quyền cập nhật tiêu chí này."},{status:403});
  // Mọi thay đổi nội dung vẫn bắt buộc thực hiện trên phiên bản Nháp.
  if(version.status!=="DRAFT")return NextResponse.json({error:"Phiên bản đã phát hành không được sửa trực tiếp. Hãy tạo bản cập nhật mới."},{status:409});
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
  if(Object.prototype.hasOwnProperty.call(body,"sequence_no"))patch.sequence_no=Math.max(1,Number(body.sequence_no)||1);
  const {error}=await admin.from("criteria_items").update(patch).eq("id",id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {error:auditError}=await admin.from("audit_logs").insert({actor_user_id:auth.user.id,table_name:"criteria_items",row_id:id,action_type:"CRITERIA_ITEM_UPDATE",old_value:{code:item.code,title:item.title,is_active:item.is_active,parent_criteria_item_id:item.parent_criteria_item_id},new_value:patch,request_meta:{source:"qlcl-ui"}});
  if(auditError)return NextResponse.json({error:`Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}`},{status:500});
  return NextResponse.json({ok:true});
}
