import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
// Chỉ đọc — dùng client thường (tôn trọng RLS theo quyền user thật), không
// cần admin client nữa (departments + callerOrganizationId đều đã có policy
// RLS select đúng phạm vi tổ chức).
export async function GET(){const auth=await requireApiPermission("emr.view");if(!auth.ok)return auth.response;const {organizationId,error:callerError}=await callerOrganizationId(auth.supabase,auth.user.id);if(callerError)return NextResponse.json({error:callerError.message},{status:400});if(!organizationId)return NextResponse.json({error:"Tài khoản chưa gắn tổ chức."},{status:400});const d=await auth.supabase.from("departments").select("id,name,short_name,department_type").eq("organization_id",organizationId).eq("is_active",true).order("name");if(d.error)return NextResponse.json({error:d.error.message},{status:400});return NextResponse.json({ok:true,departments:d.data??[]});}
