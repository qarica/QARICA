import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const PUBLISH_RPC = "qlcl_publish_criteria_version_v1";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");
  if(!auth.ok)return auth.response;

  const {id}=await params;
  const body=await request.json().catch(()=>({}));
  const versionId=String(body.version_id||"").trim();
  if(!versionId)return NextResponse.json({error:"Thiếu phiên bản cần phát hành."},{status:400});

  const admin=createAdminClient();
  const {data:tx,error:txError}=await admin.rpc(PUBLISH_RPC,{
    p_criteria_set_id:id,
    p_version_id:versionId,
    p_actor_user_id:auth.user.id,
  });

  if(txError){
    const message=rpcErrorMessage(txError,"Không thể phát hành bộ tiêu chí.");
    return NextResponse.json(
      {error:message},
      {status:/không tìm thấy|nháp|ngưng|chưa có|trạng thái|ngoài phạm vi/i.test(message)?409:400},
    );
  }

  return NextResponse.json({
    ok:true,
    version_no:tx?.version_no,
    status:tx?.status||"PUBLISHED",
    effective_from:tx?.effective_from||null,
    transaction:"atomic",
  });
}
