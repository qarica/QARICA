import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(){const auth=await requireApiPermission("emr.view");if(!auth.ok)return auth.response;const admin=createAdminClient();const {data:p}=await admin.from("profiles").select("organization_id").eq("user_id",auth.user.id).maybeSingle();if(!p?.organization_id)return NextResponse.json({error:"Tài khoản chưa gắn tổ chức."},{status:400});const d=await admin.from("departments").select("id,name,short_name").eq("organization_id",p.organization_id).eq("is_active",true).order("name");if(d.error)return NextResponse.json({error:d.error.message},{status:400});return NextResponse.json({ok:true,departments:d.data??[]});}
