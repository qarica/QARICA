import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CREATE_ITEM_RPC = "qlcl_create_criteria_item_v1";
const clean=(value:unknown)=>String(value??"").trim();
const numberOrNull=(value:unknown)=>{const raw=String(value??"").trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null;};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");
  if(!auth.ok)return auth.response;

  const {id}=await params;
  const body=await request.json().catch(()=>({}));
  const title=clean(body.title);
  if(!title)return NextResponse.json({error:"Tên tiêu chí/tiểu mục là bắt buộc."},{status:400});

  const admin=createAdminClient();
  const {data:tx,error:txError}=await admin.rpc(CREATE_ITEM_RPC,{
    p_actor_user_id:auth.user.id,
    p_criteria_set_id:id,
    p_title:title,
    p_code:clean(body.code).toUpperCase()||null,
    p_description:clean(body.description)||null,
    p_parent_criteria_item_id:clean(body.parent_criteria_item_id)||null,
    p_requested_item_type:clean(body.item_type).toUpperCase()||null,
    p_sequence_no:Number(body.sequence_no)>0?Number(body.sequence_no):null,
    p_chapter_code:clean(body.chapter_code)||null,
    p_chapter_name:clean(body.chapter_name)||null,
    p_score_weight:Math.max(1,Number(body.score_weight)||1),
    p_is_core:body.is_core===true,
    p_is_mandatory:body.is_mandatory===true,
    p_max_score:numberOrNull(body.max_score),
  });

  if(txError){
    const message=rpcErrorMessage(txError,"Không tạo được tiêu chí.");
    return NextResponse.json(
      {error:message},
      {status:/không tìm thấy|ngưng|nháp|đã tồn tại|không hợp lệ|bắt buộc|ngoài phạm vi/i.test(message)?409:400},
    );
  }

  return NextResponse.json({
    ok:true,
    item:{
      id:tx?.id,
      code:tx?.code??null,
      title:tx?.title??title,
      parent_criteria_item_id:tx?.parent_criteria_item_id??null,
      item_type:tx?.item_type,
      sequence_no:tx?.sequence_no,
    },
    transaction:"atomic",
  });
}
