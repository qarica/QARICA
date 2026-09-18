import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const clean=(value:unknown)=>String(value??"").trim();
const DIRECTIONS=new Set(["HIGHER_IS_BETTER","LOWER_IS_BETTER","TARGET_RANGE","NEUTRAL"]);
const CALC_TYPES=new Set(["RAW","PERCENTAGE","RATIO","RATE","AVERAGE","COUNT"]);
const FREQUENCIES=new Set(["DAILY","WEEKLY","MONTHLY","QUARTERLY","SEMIANNUAL","ANNUAL"]);

export async function POST(request:Request){
 const auth=await requireApiPermission("indicators.manage");if(!auth.ok)return auth.response;
 const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const name=clean(body.name),purpose=clean(body.purpose)||null,qualityDimension=clean(body.quality_dimension)||null;
 const calculationType=clean(body.calculation_type||"RAW").toUpperCase(),direction=clean(body.desired_direction||"NEUTRAL").toUpperCase(),frequency=clean(body.frequency||"MONTHLY").toUpperCase(),unit=clean(body.unit)||null;
 let code=clean(body.code).toUpperCase();
 if(!name)return NextResponse.json({error:"Tên chỉ số là bắt buộc."},{status:400});
 if(!CALC_TYPES.has(calculationType))return NextResponse.json({error:"Loại tính chỉ số không hợp lệ."},{status:400});
 if(!DIRECTIONS.has(direction))return NextResponse.json({error:"Chiều mong muốn không hợp lệ."},{status:400});
 if(!FREQUENCIES.has(frequency))return NextResponse.json({error:"Tần suất không hợp lệ."},{status:400});
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active)return NextResponse.json({error:"Tài khoản không hợp lệ hoặc chưa gắn bệnh viện."},{status:403});
 if(!code){
   const {data:generated,error:codeError}=await admin.rpc("qlcl_next_master_code_v1",{p_org:caller.organization_id,p_kind:"INDICATOR",p_work_year:new Date().getFullYear()});
   if(codeError||!generated)return NextResponse.json({error:codeError?.message||"Không sinh được mã chỉ số."},{status:400});
   code=String(generated);
 }
 const {data:dup}=await admin.from("indicator_definitions").select("id").eq("organization_id",caller.organization_id).eq("code",code).maybeSingle();
 if(dup)return NextResponse.json({error:"Mã chỉ số đã tồn tại."},{status:409});
 const {data:def,error:defError}=await admin.from("indicator_definitions").insert({organization_id:caller.organization_id,code,name,purpose,quality_dimension:qualityDimension,is_active:true,updated_at:new Date().toISOString()}).select("id,code,name").single();
 if(defError||!def)return NextResponse.json({error:defError?.message||"Không tạo được chỉ số."},{status:400});
 const multiplier=body.multiplier===null||body.multiplier===undefined||String(body.multiplier).trim()===""?null:Number(body.multiplier);
 const {data:version,error:versionError}=await admin.from("indicator_definition_versions").insert({indicator_definition_id:def.id,version_no:1,status:"DRAFT",calculation_type:calculationType,desired_direction:direction,frequency,unit,multiplier:Number.isFinite(multiplier as number)?multiplier:null,effective_from:clean(body.effective_from)||null}).select("id,version_no,status").single();
 if(versionError||!version){await admin.from("indicator_definitions").delete().eq("id",def.id);return NextResponse.json({error:versionError?.message||"Không tạo được phiên bản chỉ số."},{status:400});}
 return NextResponse.json({ok:true,id:def.id,code:def.code,name:def.name,version_id:version.id,version_no:version.version_no,status:version.status});
}
