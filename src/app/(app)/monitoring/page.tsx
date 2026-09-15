import { redirect } from "next/navigation";
import { MonitoringClient } from "@/components/monitoring-client";
import { Preset5SCreateClient } from "@/components/preset-5s-create-client";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

export default async function MonitoringPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["monitoring.view", "monitoring.perform", "checklists.view", "checklists.manage"])) redirect("/dashboard?forbidden=1");
  const year = await getWorkYear();
  const supabase = await createClient();
  const [templatesRes, versionsRes, sectionsRes, itemsRes, roundsRes, departmentsRes] = await Promise.all([
    supabase.from("checklist_templates").select("id,code,name,description,owner_department_id,is_active,created_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("checklist_versions").select("id,checklist_template_id,version_no,status,effective_from,effective_to,scoring_method,published_at").order("version_no", { ascending: false }),
    supabase.from("checklist_sections").select("id,checklist_version_id"),
    supabase.from("checklist_items").select("id,checklist_version_id"),
    supabase.from("monitoring_rounds").select("id,record_id,checklist_version_id,work_year,scheduled_date,target_department_id,target_area,workflow_status,started_at,completed_at").eq("work_year", year).neq("workflow_status", "CANCELLED").order("scheduled_date", { ascending: false, nullsFirst: false }).order("started_at", { ascending: false, nullsFirst: false }),
    supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name"),
  ]);

  const rounds = (roundsRes.data ?? []) as any[];
  const roundIds = rounds.map((x) => x.id).filter(Boolean);
  const roundRecordIds = rounds.map((x) => x.record_id).filter(Boolean);
  const [recordsRes, roundResponsesRes] = await Promise.all([
    roundRecordIds.length ? supabase.from("records").select("id,record_code,title,lifecycle_status").in("id", roundRecordIds) : Promise.resolve({ data: [], error: null }),
    roundIds.length ? supabase.from("checklist_responses").select("monitoring_round_id,result_status,answer_value").in("monitoring_round_id", roundIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const firstError = [templatesRes, versionsRes, sectionsRes, itemsRes, roundsRes, departmentsRes, recordsRes, roundResponsesRes].find((r: any) => r.error)?.error;
  const versions = (versionsRes.data ?? []) as any[];
  const latestVersionMap = new Map<string, any>();
  for (const version of versions) { const current = latestVersionMap.get(version.checklist_template_id); if (!current || Number(version.version_no) > Number(current.version_no)) latestVersionMap.set(version.checklist_template_id, version); }
  const sectionCountMap = new Map<string, number>(); for (const row of sectionsRes.data ?? []) sectionCountMap.set((row as any).checklist_version_id, (sectionCountMap.get((row as any).checklist_version_id) ?? 0) + 1);
  const itemCountMap = new Map<string, number>(); for (const row of itemsRes.data ?? []) itemCountMap.set((row as any).checklist_version_id, (itemCountMap.get((row as any).checklist_version_id) ?? 0) + 1);
  const templateRows = (templatesRes.data ?? []).map((template: any) => { const latest = latestVersionMap.get(template.id); return { ...template, latest_version_no: latest?.version_no ?? null, latest_version_status: latest?.status ?? null, latest_version_id: latest?.id ?? null, scoring_method: latest?.scoring_method ?? null, effective_from: latest?.effective_from ?? null, section_count: latest?.id ? sectionCountMap.get(latest.id) ?? 0 : 0, item_count: latest?.id ? itemCountMap.get(latest.id) ?? 0 : 0 }; });
  const recordMap = new Map((recordsRes.data ?? []).map((r: any) => [r.id, r]));
  const versionById = new Map(versions.map((v: any) => [v.id, v]));
  const templateNameMap = new Map((templatesRes.data ?? []).map((t: any) => [t.id, t.name]));
  const responsesByRound = new Map<string, any[]>();
  for (const response of roundResponsesRes.data ?? []) { const key = (response as any).monitoring_round_id; responsesByRound.set(key, [...(responsesByRound.get(key) ?? []), response]); }
  const monitoringRows = rounds.filter((round: any) => { const record = recordMap.get(round.record_id) as any; return !!record && !isOperationallyHiddenStatus(record.lifecycle_status) && round.workflow_status !== "CANCELLED"; }).map((round: any) => {
    const record = recordMap.get(round.record_id) as any; const version = versionById.get(round.checklist_version_id) as any; const responses = responsesByRound.get(round.id) ?? [];
    const waitingRecheck = round.workflow_status === "IN_PROGRESS" && responses.some((x: any) => x.result_status === "FAIL" && x.answer_value?.followup?.status === "PENDING_RECHECK");
    const phase = round.workflow_status === "SCHEDULED" ? "NEEDS_CHECK" : round.workflow_status === "IN_PROGRESS" && !responses.length ? "IN_PROGRESS" : waitingRecheck ? "WAITING_RECHECK" : round.workflow_status === "AWAITING_CONFIRMATION" ? "AWAITING_CONFIRMATION" : ["CONFIRMED", "CLOSED"].includes(round.workflow_status) ? "DONE" : "OTHER";
    const pass = responses.filter((x:any)=>String(x.result_status).toUpperCase()==="PASS").length; const fail = responses.filter((x:any)=>String(x.result_status).toUpperCase()==="FAIL").length; const scored=pass+fail;
    return { ...round, record_code: record?.record_code || "—", title: record?.title || "Đợt giám sát", checklist_name: templateNameMap.get(version?.checklist_template_id) || "Bảng kiểm", phase, pass, fail, scored, pass_pct: scored?Math.round(pass/scored*100):null };
  });
  const departments = (departmentsRes.data ?? []) as any[]; const depMap=new Map(departments.map((d:any)=>[d.id,d.short_name||d.name]));
  const canManageTemplates = user.permissions.includes("checklists.manage"); const needAttention = monitoringRows.filter((x: any) => ["NEEDS_CHECK", "IN_PROGRESS", "WAITING_RECHECK", "AWAITING_CONFIRMATION"].includes(x.phase)).length; const publishedTemplates = templateRows.filter((x: any) => x.latest_version_status === "PUBLISHED").length;
  const allPass=monitoringRows.reduce((s,x)=>s+x.pass,0),allFail=monitoringRows.reduce((s,x)=>s+x.fail,0),allScored=allPass+allFail; const passPct=allScored?Math.round(allPass/allScored*100):0; const done=monitoringRows.filter((x:any)=>x.phase==="DONE").length; const completionPct=monitoringRows.length?Math.round(done/monitoringRows.length*100):0;
  const months=Array.from({length:12},(_,i)=>({label:`T${i+1}`,value:0})); for(const x of monitoringRows){const m=Number(String(x.scheduled_date||"").slice(5,7));if(m>=1&&m<=12)months[m-1].value+=1}
  const depAgg=new Map<string,{pass:number;fail:number}>(); for(const x of monitoringRows){const key=x.target_department_id||"none";const a=depAgg.get(key)||{pass:0,fail:0};a.pass+=x.pass;a.fail+=x.fail;depAgg.set(key,a)}
  const depBars=Array.from(depAgg.entries()).map(([id,a])=>{const total=a.pass+a.fail;const pct=total?Math.round(a.pass/total*100):0;return{label:String(depMap.get(id)||"Chưa xác định"),value:pct,tone:pct>=90?"green" as const:pct>=75?"blue" as const:pct>=60?"amber" as const:"red" as const,caption:`${total} mục đã chấm`}}).sort((a,b)=>a.value-b.value).slice(0,10);

  return <div className="page-stack monitoring-workspace tqm-workspace">
    <style>{TQM_CHART_CSS + `.monitoring-workspace .tqm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.monitoring-workspace .tqm-kpi{background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:16px}.monitoring-workspace .tqm-kpi span{font-size:10px;color:#718187;font-weight:800;text-transform:uppercase}.monitoring-workspace .tqm-kpi strong{display:block;font-size:30px;margin-top:8px}.monitoring-workspace .tqm-kpi small{font-size:10px;color:#7d8c92}.monitoring-workspace .tqm-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.monitoring-workspace .tqm-head{padding:17px 18px 6px}.monitoring-workspace .tqm-head h2{margin:0;font-size:15px}.monitoring-workspace .tqm-head p{margin:4px 0 0;color:#74838a;font-size:11px}.monitoring-workspace{overflow-x:clip}.monitoring-workspace .detail-label{font-size:10px;font-weight:900;letter-spacing:.1em;color:#6c7d84;margin:2px;text-transform:uppercase}@media(max-width:900px){.monitoring-workspace .tqm-grid{grid-template-columns:1fr}.monitoring-workspace .tqm-kpis{grid-template-columns:1fr 1fr}}`}</style>
    <section className="monitoring-hero"><div><div className="eyebrow">ĐO LƯỜNG & GIÁM SÁT · {year}</div><h1>Giám sát & Bảng kiểm</h1><p>Nhìn tình hình giám sát toàn viện trước, sau đó mới drill-down vào từng bảng kiểm và từng đợt.</p><div className="monitoring-hero-meta"><span>{templateRows.length} mẫu bảng kiểm</span><span>{publishedTemplates} mẫu đã phát hành</span><span>{monitoringRows.length} đợt trong năm</span><span>{needAttention} việc cần xử lý</span></div></div><div className="monitoring-flow"><small>Luồng TQM</small><strong>Chuẩn → Giám sát → Phát hiện → Khắc phục → Recheck → Chuẩn hóa</strong><div className="flow-line" /></div></section>
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}
    <section className="tqm-kpis"><article className="tqm-kpi"><span>Tỷ lệ mục đạt</span><strong>{passPct}%</strong><small>{allPass}/{allScored || 0} mục được chấm đạt</small></article><article className="tqm-kpi"><span>Hoàn thành đợt giám sát</span><strong>{completionPct}%</strong><small>{done}/{monitoringRows.length} đợt đã xác nhận/đóng</small></article><article className="tqm-kpi"><span>Lượt giám sát năm</span><strong>{monitoringRows.length}</strong><small>Tổng đợt không bị hủy</small></article><article className="tqm-kpi"><span>Cần xử lý</span><strong>{needAttention}</strong><small>Chờ kiểm, recheck hoặc xác nhận QLCL</small></article></section>
    <section className="tqm-grid"><article className="panel"><div className="tqm-head"><h2>Xu hướng lượt giám sát 12 tháng</h2><p>Cho biết nhịp triển khai giám sát trong năm.</p></div><TqmTrend points={months} unit=""/></article><article className="panel"><div className="tqm-head"><h2>Kết quả bảng kiểm</h2><p>Tổng hợp PASS/FAIL từ các mục đã chấm.</p></div><TqmDonut value={passPct} label="Mục đạt" segments={[{label:"Đạt",value:allPass,tone:"brand"},{label:"Chưa đạt",value:allFail,tone:"red"}]} /></article></section>
    <section className="panel"><div className="tqm-head"><h2>Giám sát theo khoa/phòng</h2><p>Xếp đơn vị có tỷ lệ mục đạt thấp lên trước để QLCL ưu tiên hỗ trợ và giám sát lại.</p></div>{depBars.length?<TqmHorizontalBars rows={depBars} max={100}/>:<div className="empty-state">Chưa có dữ liệu chấm điểm theo khoa/phòng.</div>}</section>
    <div className="detail-label">BẢNG KIỂM & ĐỢT GIÁM SÁT CHI TIẾT</div>
    <Preset5SCreateClient departments={departments} canManage={canManageTemplates} />
    <MonitoringClient year={year} canManageTemplates={canManageTemplates} templateRows={templateRows as any[]} monitoringRows={monitoringRows as any[]} departments={departments} />
  </div>;
}
