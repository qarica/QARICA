import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";

const csvCell=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
const LOCATION:Record<string,string>={PATIENT_ROOM:"Phòng bệnh",PATIENT_BED:"Giường bệnh",TOILET:"Nhà vệ sinh",CORRIDOR:"Hành lang",STAIRS:"Cầu thang",PROCEDURE_ROOM:"Phòng thủ thuật",WAITING_AREA:"Khu chờ",PUBLIC_AREA:"Khu vực công cộng",OTHER:"Khác"};
const HARM:Record<string,string>={NO_HARM:"Không tổn hại",NEAR_MISS:"Suýt xảy ra",MILD:"Nhẹ",MODERATE:"Trung bình",SEVERE:"Nặng",DEATH:"Tử vong"};

export async function GET(request:Request){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Chưa đăng nhập."},{status:401});
 const [{data:viewSummary},{data:viewCase},{data:triage}]=await Promise.all([
  supabase.rpc("has_permission",{p_permission_code:"incident.view_summary"}),
  supabase.rpc("has_permission",{p_permission_code:"incident.view_case"}),
  supabase.rpc("has_permission",{p_permission_code:"incident.triage"})
 ]);
 if(!viewSummary&&!viewCase&&!triage)return NextResponse.json({error:"Bạn không có quyền xuất danh sách sự cố."},{status:403});
 const year=await getWorkYear();const url=new URL(request.url);const department=url.searchParams.get("department")?.trim()||null;const status=url.searchParams.get("status")?.trim().toUpperCase()||null;
 const [recordsRes,incidentsRes,depsRes,reportsRes]=await Promise.all([
  supabase.from("records").select("id,record_code,title,lifecycle_status").eq("record_type","INCIDENT").eq("work_year",year).order("created_at",{ascending:true}),
  supabase.from("incidents").select("id,record_id,occurred_at,reported_at,incident_location_department_id,incident_location_type,incident_location_text,workflow_status,harm_status,serious_event_flag,investigation_required,rca_required,lead_department_id,case_owner_user_id,summary"),
  supabase.from("departments").select("id,name,short_name"),
  (viewCase||triage)?supabase.from("incident_reports").select("incident_id,incident_subject_type,initial_occurrence_classification"):Promise.resolve({data:[] as any[],error:null})
 ]);
 const error=recordsRes.error||incidentsRes.error||depsRes.error||reportsRes.error;if(error)return NextResponse.json({error:error.message},{status:400});
 const recMap=new Map(((recordsRes.data??[]) as any[]).filter(r=>!isOperationallyHiddenStatus(r.lifecycle_status)).map(r=>[r.id,r]));
 const depMap=new Map((depsRes.data??[]).map((d:any)=>[d.id,d.short_name||d.name]));const reportMap=new Map((reportsRes.data??[]).map((r:any)=>[r.incident_id,r]));
 let rows=((incidentsRes.data??[]) as any[]).filter(x=>recMap.has(x.record_id));
 if(department)rows=rows.filter(x=>x.incident_location_department_id===department);if(status)rows=rows.filter(x=>String(x.workflow_status||"").toUpperCase()===status);
 const headers=["Mã sự cố","Tên hồ sơ","Ngày giờ xảy ra","Ngày báo cáo","Khoa/phòng xảy ra","Loại vị trí","Chi tiết vị trí","Đối tượng sự cố","Phân loại ban đầu","Mức ảnh hưởng","Trạng thái xử lý","Nghiêm trọng","Cần điều tra","Cần RCA","Đơn vị phụ trách","Mô tả ngắn"];
 const lines=[headers.map(csvCell).join(",")];
 for(const x of rows){const r:any=recMap.get(x.record_id),rp:any=reportMap.get(x.id);lines.push([r?.record_code,r?.title,x.occurred_at,x.reported_at,depMap.get(x.incident_location_department_id)||"Chưa xác định",LOCATION[x.incident_location_type]||x.incident_location_type||"Chưa chuẩn hóa",x.incident_location_text,rp?.incident_subject_type||"",rp?.initial_occurrence_classification||"",HARM[x.harm_status]||x.harm_status||"Chưa phân loại",x.workflow_status,x.serious_event_flag?"Có":"Không",x.investigation_required?"Có":"Không",x.rca_required?"Có":"Không",depMap.get(x.lead_department_id)||"Chưa gán",x.summary].map(csvCell).join(","));}
 const bom="\uFEFF";return new NextResponse(bom+lines.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="danh-sach-su-co-${year}.csv"`,"Cache-Control":"private, no-store"}});
}