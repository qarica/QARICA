import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";

const CREATE_RPC = "qlcl_create_criteria_set_v1";
const clean=(value:unknown)=>String(value??"").trim();

export async function POST(request:Request){
  const auth=await requireApiPermission("criteria.manage");
  if(!auth.ok)return auth.response;

  const body=await request.json().catch(()=>({}));
  const name=clean(body.name);
  const code=clean(body.code).toUpperCase()||null;
  const description=clean(body.description)||null;
  const effectiveFrom=clean(body.effective_from)||null;
  if(!name)return NextResponse.json({error:"Tên bộ tiêu chí là bắt buộc."},{status:400});

  const admin=createAdminClient();
  const {data:tx,error:txError}=await admin.rpc(CREATE_RPC,{
    p_actor_user_id:auth.user.id,
    p_code:code,
    p_name:name,
    p_description:description,
    p_effective_from:effectiveFrom,
  });
  if(txError){
    const message=rpcErrorMessage(txError,"Không tạo được bộ tiêu chí.");
    return NextResponse.json(
      {error:message},
      {status:/đã tồn tại|bắt buộc|không hợp lệ|chưa gắn|ngoài phạm vi/i.test(message)?409:400},
    );
  }

  return NextResponse.json({
    ok:true,
    id:tx?.id,
    code:tx?.code,
    name:tx?.name,
    version_id:tx?.version_id,
    version_no:tx?.version_no??1,
    status:tx?.status||"DRAFT",
    transaction:"atomic",
  });
}
