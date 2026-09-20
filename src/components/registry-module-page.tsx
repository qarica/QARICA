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
export type RegistryModuleConfig={eyebrow:string;title:string;description:string;permissions:string[];recordTypes:string[];tabs?:ModuleTab[];foundationNote?:string;};

const ASSESSMENT_ANALYTICS_TYPES = new Set(["ASSESSMENT", "EXTERNAL_ASSESSMENT", "AUDIT", "INSPECTION"]);
const CORRECTIVE_ANALYTICS_TYPES = new Set(["FINDING", "FEEDBACK"]);
const OPERATIONS_ANALYTICS_TYPES = new Set(["DIRECTIVE", "REPORT"]);
const RISK_PROACTIVE_TYPES = new Set(["FMEA"]);
const REGISTRY_PAGE_SIZE = 1000;

export async function RegistryModulePage({config}:{config:RegistryModuleConfig}){
 const {user}=await requireUserContext();if(!hasAnyPermission(user,config.permissions))redirect("/dashboard?forbidden=1");
 const supabase=await createClient();const year=await getWorkYear();const ux=getModuleUx(config.recordTypes);const spec=getModuleOperatingSpec(config.recordTypes);const createType=config.recordTypes.length===1?config.recordTypes[0]:null;const canCreate=!!createType&&canCreateDomainRecord(user.permissions,createType);
 const {data,error}=await supabase.from("records").select("id,record_type,record_code,title,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at").in("record_type",config.recordTypes).eq("work_year",year).order("updated_at",{ascending:false}).range(0,REGISTRY_PAGE_SIZE-1);
 const registryTruncated=(data?.length??0)>=REGISTRY_PAGE_SIZE;
 const raw=((data??[]) as any[]).filter(r=>!isOperationallyHiddenStatus(r.lifecycle_status));const depIds=Array.from(new Set(raw.map(r=>r.owner_department_id).filter(Boolean)));const userIds=Array.from(new Set(raw.map(r=>r.owner_user_id).filter(Boolean)));
 const [deps,profiles]=await Promise.all([depIds.length?supabase.from("departments").select("id,name,short_name").in("id",depIds):Promise.resolve({data:[],error:null}),userIds.length?supabase.from("profiles").select("user_id,full_name,email").in("user_id",userIds):Promise.resolve({data:[],error:null})]);
 const depMap=new Map((deps.data??[]).map((r:any)=>[r.id,r.short_name||r.name]));const profileMap=new Map((profiles.data??[]).map((r:any)=>[r.user_id,r.full_name||r.email||r.user_id]));
 const rows=raw.map(r=>({...r,department_name:depMap.get(r.owner_department_id)||"—",owner_name:profileMap.get(r.owner_user_id)||"Chưa gán người",route:routeForRecord(r.record_type,r.id)}));
 const assessmentType=createType&&ASSESSMENT_ANALYTICS_TYPES.has(createType)?createType:null;
 const correctiveType=createType&&CORRECTIVE_ANALYTICS_TYPES.has(createType)?createType:null;
 const operationsType=createType&&OPERATIONS_ANALYTICS_TYPES.has(createType)?createType:null;
 const proactiveRiskType=createType&&RISK_PROACTIVE_TYPES.has(createType)?createType:null;
 const indicatorType=createType==="INDICATOR_MEASUREMENT";
 return <div className="page-stack registry-module-page modern-module-page tqm-registry-page">
  <PageHeader eyebrow={`${config.eyebrow} · NĂM ${year}`} title={config.title} description={config.description}/>
  {canCreate&&createType?<div className="module-action-row"><DomainCreateClient recordType={createType} workYear={year}/></div>:null}
  {error?<div className="alert error">Không tải được dữ liệu: {error.message}</div>:null}
  {registryTruncated?<div className="alert warning">Danh sách đang hiển thị {REGISTRY_PAGE_SIZE} hồ sơ cập nhật gần nhất. Hãy dùng bộ lọc hoặc phân trang trước khi xem đây là toàn bộ dữ liệu.</div>:null}
  {indicatorType?<IndicatorQualityOverview rows={rows} year={year} canManage={user.permissions.includes("indicators.manage")} canSync={user.permissions.includes("indicators.enter")||user.permissions.includes("indicators.manage")}/>:assessmentType?<AssessmentInspectionOverviewV2 rows={rows} recordType={assessmentType}/>:correctiveType?<CorrectiveSafetyOverview rows={rows} recordType={correctiveType}/>:operationsType?<OperationsObligationsOverview rows={rows} recordType={operationsType}/>:proactiveRiskType?<RiskProactiveOverview rows={rows} recordType={proactiveRiskType}/>:<TqmRegistryOverview rows={rows} recordType={createType||config.recordTypes[0]||"RECORD"}/>} 
  <section className="module-hero-summary tqm-principle-hero"><div><span className="module-overline">TQM · QUẢN LÝ THEO QUÁ TRÌNH</span><h2>{config.title}</h2><p>{spec?.purpose||config.foundationNote||ux.principle}</p></div><div className="module-hero-stats"><div><strong>{ux.workflow.length}</strong><span>Bước quy trình</span></div><div><strong>{ux.related.length}</strong><span>Liên kết nghiệp vụ</span></div></div></section>
  <RegistryModuleWorkspace year={year} rows={rows} recordType={createType||config.recordTypes[0]||"RECORD"} workflow={ux.workflow} principle={ux.principle} related={ux.related} operatingSpec={spec}/>
  {config.tabs?.length?<nav className="module-tabs module-tabs-bottom">{config.tabs.map(tab=><a href={tab.href} key={tab.href}>{tab.label}</a>)}</nav>:null}
 </div>;
}
