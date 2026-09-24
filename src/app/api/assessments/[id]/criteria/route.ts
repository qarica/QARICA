import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const ACTIONS=new Set(["SAVE_DRAFT","SUBMIT"]);
const SAVE_RPC="qlcl_save_criterion_assessment_v1";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const supabase=await createClient();
  const{data:auth}=await supabase.auth.getUser();
  if(!auth.user)return NextResponse.json({error:"Chưa đăng nhập."},{status:401});

  const[{data:canAssess},{data:canManage}]=await Promise.all([
    supabase.rpc("has_permission",{p_permission_code:"criteria.assess"}),
    supabase.rpc("has_permission",{p_permission_code:"criteria.manage"}),
  ]);
  if(!canAssess&&!canManage)return NextResponse.json({error:"Bạn chưa có quyền tự đánh giá tiêu chí."},{status:403});

  const{id:recordId}=await params;
  const body:any=await request.json().catch(()=>({}));
  const action=String(body.action||"").toUpperCase();
  const criterionId=String(body.criterion_id||"").trim();
  const scoreRaw=body.score;
  const score=scoreRaw===""||scoreRaw==null?null:Number(scoreRaw);
  const result=String(body.result||"").trim()||null;
  const note=String(body.summary_comment||"").trim()||null;

  if(!ACTIONS.has(action)||!criterionId||(score==null&&!result)||(score!=null&&!Number.isFinite(score))){
    return NextResponse.json({error:"Thiếu tiêu chí, kết quả đánh giá hoặc thao tác không hợp lệ."},{status:400});
  }

  const admin=createAdminClient();
  const{data:tx,error:txError}=await admin.rpc(SAVE_RPC,{
    p_assessment_record_id:recordId,
    p_actor_user_id:auth.user.id,
    p_criteria_item_id:criterionId,
    p_action:action,
    p_score:score,
    p_result:result,
    p_note:note,
  });

  if(txError){
    const message=rpcErrorMessage(txError,"Không lưu được đánh giá tiêu chí.");
    return NextResponse.json(
      {error:message},
      {status:/quyền|đơn vị khác|ngoài phạm vi/i.test(message)?403:/đã đóng|giai đoạn|không áp dụng|không thuộc|đã được rà soát|điểm|trạng thái/i.test(message)?409:400},
    );
  }

  return NextResponse.json({
    ok:true,
    status:tx?.status|| (action==="SUBMIT"?"SUBMITTED":"DRAFT"),
    message:tx?.message|| (action==="SUBMIT"?"Đã gửi đánh giá tiêu chí.":"Đã lưu nháp tiêu chí."),
    transaction:"atomic",
  });
}
