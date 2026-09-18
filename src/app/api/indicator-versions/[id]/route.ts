import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
const clean=(v:unknown)=>String(v??"").trim();
const DIRECTIONS=new Set(["HIGHER_IS_BETTER","LOWER_IS_BETTER","TARGET_RANGE","NEUTRAL"]);
const CALC_TYPES=new Set(["RAW","PERCENTAGE","RATIO","RATE","AVERAGE","COUNT"]);
const FREQUENCIES=new Set(["DAILY","WEEKLY","MONTHLY","QUARTERLY","SEMIANNUAL","ANNUAL"]);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireApiPermission("indicators.manage");if(!auth.ok)return auth.response;
 const {id}=await params;const body=await request.json().catch(()=>({}));const admin=createAdminClient();
 const {data:version}=await admin.from("indicator_definition_versions").select("id,indicator_definition_id,status").eq("id",id).maybeSingle();
 if(!version)return NextResponse.json({error:"Không tìm thấy phiên bản chỉ số."},{status:404});
 if(version.status!=="DRAFT")return NextResponse.json({error:"Phiên bản đã phát hành không được sửa trực tiếp."},{status:409});
 const {data:def}=await admin.from("indicator_definitions").select("organization_id").eq("id",version.indicator_definition_id).maybeSingle();
 const {data:caller}=await admin.from("profiles").select("organization_id,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(!caller?.organization_id||!caller.is_active||!def||def.organization_id!==caller.organization_id)return NextResponse.json({error:"Không có quyền cập nhật phiên bản này."},{status:403});
 const patch:any={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(body,"calculation_type")){const v=clean(body.calculation_type).toUpperCase();if(!CALC_TYPES.has(v))return NextResponse.json({error:"Loại tính không hợp lệ."},{status:400});patch.calculation_type=v;}
 if(Object.prototype.hasOwnProperty.call(body,"desired_direction")){const v=clean(body.desired_direction).toUpperCase();if(!DIRECTIONS.has(v))return NextResponse.json({error:"Chiều mong muốn không hợp lệ."},{status:400});patch.desired_direction=v;}
 if(Object.prototype.hasOwnProperty.call(body,"frequency")){const v=clean(body.frequency).toUpperCase();if(!FREQUENCIES.has(v))return NextResponse.json({error:"Tần suất không hợp lệ."},{status:400});patch.frequency=v;}
 if(Object.prototype.hasOwnProperty.call(body,"unit"))patch.unit=clean(body.unit)||null;
 if(Object.prototype.hasOwnProperty.call(body,"multiplier")){const raw=String(body.multiplier??"").trim();patch.multiplier=raw?Number(raw):null;}
 if(Object.prototype.hasOwnProperty.call(body,"effective_from"))patch.effective_from=clean(body.effective_from)||null;
 const {error}=await admin.from("indicator_definition_versions").update(patch).eq("id",id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}
