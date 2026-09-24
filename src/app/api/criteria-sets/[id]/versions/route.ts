import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CREATE_REVISION_RPC = "qlcl_create_criteria_revision_v1";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireApiPermission("criteria.manage");
  if(!auth.ok)return auth.response;

  const {id}=await params;
  const body=await request.json().catch(()=>({}));
  const effectiveFrom=String(body.effective_from||"").trim()||null;
  const admin=createAdminClient();

  const {data:tx,error:txError}=await admin.rpc(CREATE_REVISION_RPC,{
    p_actor_user_id:auth.user.id,
    p_criteria_set_id:id,
    p_effective_from:effectiveFrom,
  });

  if(txError){
    const message=rpcErrorMessage(txError,"Không tạo được phiên bản cập nhật.");
    return NextResponse.json(
      {error:message},
      {status:/không tìm thấy|ngưng|phiên bản nguồn|không hợp lệ|ngoài phạm vi/i.test(message)?409:400},
    );
  }

  return NextResponse.json({
    ok:true,
    existing:!!tx?.existing,
    version_id:tx?.version_id,
    version_no:tx?.version_no,
    cloned_items:Number(tx?.cloned_items||0),
    transaction:"atomic",
  });
}
