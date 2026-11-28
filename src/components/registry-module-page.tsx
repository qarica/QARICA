import Link from "next/link";
import { redirect } from "next/navigation";
import { AssessmentInspectionOverviewV2 } from "@/components/assessment-inspection-overview-v2";
import { CorrectiveSafetyOverview } from "@/components/corrective-safety-overview";
import { DomainCreateClient } from "@/components/domain-create-client";
import { IndicatorQualityOverview } from "@/components/indicator-quality-overview";
import { OperationsObligationsOverview } from "@/components/operations-obligations-overview";
import { PageHeader } from "@/components/page-header";
import { RegistryModuleWorkspace } from "@/components/registry-module-workspace";
import { RiskProactiveOverview } from "@/components/risk-proactive-overview";
import { TqmRegistryOverview } from "@/components/tqm-registry-overview";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { canCreateDomainRecord } from "@/lib/domain-create-spec";
import { getModuleOperatingSpec } from "@/lib/module-operating-spec";
import { getModuleUx } from "@/lib/module-ux";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export type ModuleTab={label:string;href:string};
export type RegistryModuleConfig={eyebrow:string;title:string;description:string;permissions:string[];recordTypes:string[];tabs?:ModuleTab[];foundationNote?:string;icon?:string;};

const ASSESSMENT_ANALYTICS_TYPES = new Set(["ASSESSMENT", "EXTERNAL_ASSESSMENT", "AUDIT", "INSPECTION"]);
const CORRECTIVE_ANALYTICS_TYPES = new Set(["FINDING", "FEEDBACK"]);
const OPERATIONS_ANALYTICS_TYPES = new Set(["DIRECTIVE", "REPORT"]);
const RISK_PROACTIVE_TYPES = new Set(["FMEA"]);
const REGISTRY_PAGE_SIZE = 1000;

// topSlot: khối điều hướng/“Cần xử lý” của cụm nghiệp vụ (vd Khắc phục & CAPA) đặt ngay dưới tiêu đề.
// recordFilter: lọc danh sách theo 1 tập hồ sơ cụ thể khi người dùng bấm một mục “Cần xử lý” (vd Finding quá hạn).
export type RegistryRecordFilter={recordIds:string[];label:string;clearHref:string};
export async function RegistryModulePage({config,topSlot,recordFilter}:{config:RegistryModuleConfig;topSlot?:React.ReactNode;recordFilter?:RegistryRecordFilter}){
 const {user}=await requireUserContext();if(!hasAnyPermission(user,config.permissions))redirect("/dashboard?forbidden=1");
 const supabase=await createClient();const year=await getWorkYear();const ux=getModuleUx(config.recordTypes);const spec=getModuleOperatingSpec(config.recordTypes);const createType=config.recordTypes.length===1?config.recordTypes[0]:null;const canCreate=!!createType&&canCreateDomainRecord(user.permissions,createType);
 const {data,error}=await supabase.from("records").select("id,record_type,record_code,title,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at").in("record_type",config.recordTypes).eq("work_year",year).order("updated_at",{ascending:false}).range(0,REGISTRY_PAGE_SIZE-1);
 const registryTruncated=(data?.length??0)>=REGISTRY_PAGE_SIZE;
 const filterIds=recordFilter?new Set(recordFilter.recordIds):null;const raw=((data??[]) as any[]).filter(r=>!isOperationallyHiddenStatus(r.lifecycle_status)&&(!filterIds||filterIds.has(r.id)));const depIds=Array.from(new Set(raw.map(r=>r.owner_department_id).filter(Boolean)));const userIds=Array.from(new Set(raw.map(r=>r.owner_user_id).filter(Boolean)));
 const [deps,profiles]=await Promise.all([depIds.length?supabase.from("departments").select("id,name,short_name").in("id",depIds):Promise.resolve({data:[],error:null}),userIds.length?supabase.from("profiles").select("user_id,full_name,email").in("user_id",userIds):Promise.resolve({data:[],error:null})]);
 const depMap=new Map((deps.data??[]).map((r:any)=>[r.id,r.short_name||r.name]));const profileMap=new Map((profiles.data??[]).map((r:any)=>[r.user_id,r.full_name||r.email||r.user_id]));
 const rows=raw.map(r=>({...r,department_name:depMap.get(r.owner_department_id)||"—",owner_name:profileMap.get(r.owner_user_id)||"Chưa gán người",route:routeForRecord(r.record_type,r.id)}));
 const assessmentType=createType&&ASSESSMENT_ANALYTICS_TYPES.has(createType)?createType:null;
 const correctiveType=createType&&CORRECTIVE_ANALYTICS_TYPES.has(createType)?createType:null;
 const operationsType=createType&&OPERATIONS_ANALYTICS_TYPES.has(createType)?createType:null;
 const proactiveRiskType=createType&&RISK_PROACTIVE_TYPES.has(createType)?createType:null;
 const indicatorType=createType==="INDICATOR_MEASUREMENT";
 return <div className="page-stack registry-module-page modern-module-page tqm-registry-page">
  <PageHeader eyebrow={`${config.eyebrow} · NĂM ${year}`} title={config.title} description={config.description} icon={config.icon} actions={canCreate&&createType?<DomainCreateClient recordType={createType} workYear={year}/>:null}/>
  {/* Nguyên tắc TQM của module: gộp banner "Quản lý theo quá trình" cũ (khối riêng + 2 ô số) thành 1 dòng ngay dưới tiêu đề.
      Giữ đủ nội dung: mục đích, số bước quy trình và các nghiệp vụ liên kết (bấm được). */}
  <p className="tqm-principle-line"><b>Quản lý theo quá trình</b><span>{spec?.purpose||config.foundationNote||ux.principle}</span><span className="tqm-principle-meta">{ux.workflow.length} bước quy trình{ux.related.length?<> · Liên kết: {ux.related.map((x,i)=><span key={x.href+x.label}>{i?", ":""}<Link href={x.href}>{x.label}</Link></span>)}</>:null}</span></p>
  {topSlot}
  {recordFilter?<div className="scope-note registry-filter-note">Đang lọc: <strong>{recordFilter.label}</strong> ({raw.length} hồ sơ) · <Link href={recordFilter.clearHref}>Bỏ lọc</Link></div>:null}
  {config.tabs?.length?<nav className="module-tabs" aria-label="Chức năng liên quan">{config.tabs.map(tab=><a href={tab.href} key={tab.href}>{tab.label}</a>)}</nav>:null}
  {error?<div className="alert error">Không tải được dữ liệu: {error.message}</div>:null}
  {registryTruncated?<div className="alert warning">Danh sách đang hiển thị {REGISTRY_PAGE_SIZE} hồ sơ cập nhật gần nhất. Hãy dùng bộ lọc hoặc phân trang trước khi xem đây là toàn bộ dữ liệu.</div>:null}
  {indicatorType?<IndicatorQualityOverview rows={rows} year={year} canSync={user.permissions.includes("indicators.enter")||user.permissions.includes("indicators.manage")}/>:assessmentType?<AssessmentInspectionOverviewV2 rows={rows} recordType={assessmentType}/>:correctiveType?<CorrectiveSafetyOverview rows={rows} recordType={correctiveType}/>:operationsType?<OperationsObligationsOverview rows={rows} recordType={operationsType}/>:proactiveRiskType?<RiskProactiveOverview rows={rows} recordType={proactiveRiskType}/>:<TqmRegistryOverview rows={rows} recordType={createType||config.recordTypes[0]||"RECORD"}/>} 
  {createType!=="ASSESSMENT"?<RegistryModuleWorkspace year={year} rows={rows} recordType={createType||config.recordTypes[0]||"RECORD"} workflow={ux.workflow} principle={ux.principle} related={ux.related} operatingSpec={spec}/>:null}
 </div>;
}
