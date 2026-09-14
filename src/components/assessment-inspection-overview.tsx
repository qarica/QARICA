import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend } from "@/components/tqm-charts";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  record_code: string;
  title: string;
  lifecycle_status: string;
  department_name: string;
  updated_at: string;
};

type Tone = "brand" | "blue" | "amber" | "red" | "green" | "slate";
const DONE = new Set(["CLOSED", "COMPLETED", "FINALIZED", "APPROVED", "REVIEWED", "SUBMITTED"]);
const ACTION_DONE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

const CSS = `${TQM_CHART_CSS}
.assessment-tqm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.assessment-tqm-kpi{background:#fff;border:1px solid #e1e9ec;border-radius:17px;padding:15px 16px}.assessment-tqm-kpi span{display:block;font-size:10px;color:#728188;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.assessment-tqm-kpi strong{display:block;font-size:29px;line-height:1;margin-top:8px}.assessment-tqm-kpi small{display:block;font-size:10px;color:#7d8c92;margin-top:6px}.assessment-tqm-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.assessment-tqm-head{padding:16px 18px 4px}.assessment-tqm-head h2{margin:0;font-size:15px}.assessment-tqm-head p{margin:4px 0 0;color:#74838a;font-size:11px}.inspection-strip{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:7px;padding:8px 18px 18px}.inspection-milestone{border:1px solid #e0e8eb;border-radius:12px;padding:10px 8px;background:#fff;text-align:center}.inspection-milestone strong{display:block;font-size:11px}.inspection-milestone span{display:block;font-size:18px;font-weight:900;margin-top:5px}.inspection-milestone small{display:block;color:#728188;font-size:9px;margin-top:3px}.inspection-milestone.done{background:#eef9f5;border-color:#cde9df}.inspection-milestone.due{background:#fff7e9;border-color:#f3dfb4}.inspection-milestone.late{background:#fff0f1;border-color:#f2cfd3}@media(max-width:1000px){.assessment-tqm-grid{grid-template-columns:1fr}.inspection-strip{grid-template-columns:repeat(4,1fr)}}@media(max-width:700px){.assessment-tqm-kpis{grid-template-columns:1fr 1fr}.inspection-strip{grid-template-columns:repeat(2,1fr)}}`;

function monthPoints(rows: Row[]) {
  const points = Array.from({ length: 12 }, (_, i) => ({ label: `T${i + 1}`, value: 0 }));
  rows.forEach((row) => {
    const d = new Date(row.updated_at);
    if (!Number.isNaN(d.getTime())) points[d.getMonth()].value += 1;
  });
  return points;
}

function statusBars(statuses: string[]) {
  const map = new Map<string, number>();
  statuses.forEach((status) => map.set(status || "UNKNOWN", (map.get(status || "UNKNOWN") || 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value], index) => ({
    label: label.replaceAll("_", " "), value, tone: (index === 0 ? "brand" : index === 1 ? "blue" : index === 2 ? "amber" : "slate") as Tone,
  }));
}

function Kpis({ items }: { items: { label: string; value: string | number; note: string }[] }) {
  return <section className="assessment-tqm-kpis">{items.map((item) => <article className="assessment-tqm-kpi" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>)}</section>;
}

export async function AssessmentInspectionOverview({ rows, recordType }: { rows: Row[]; recordType: string }) {
  const supabase = await createClient();
  const recordIds = rows.map((row) => row.id);
  if (!recordIds.length) return null;

  if (recordType === "ASSESSMENT") {
    const { data: rounds } = await supabase.from("assessment_rounds").select("id,record_id,workflow_status").in("record_id", recordIds);
    const roundRows = (rounds ?? []) as any[];
    const roundIds = roundRows.map((row) => row.id);
    const [scopeResult, assessmentResult] = await Promise.all([
      roundIds.length ? supabase.from("assessment_round_criteria").select("id,assessment_round_id").in("assessment_round_id", roundIds) : Promise.resolve({ data: [] as any[] }),
      roundIds.length ? supabase.from("criterion_assessments").select("assessment_round_id,workflow_status").in("assessment_round_id", roundIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const scopes = (scopeResult.data ?? []) as any[];
    const assessments = (assessmentResult.data ?? []) as any[];
    const submitted = assessments.filter((row) => DONE.has(String(row.workflow_status))).length;
    const completion = scopes.length ? Math.min(100, Math.round(submitted / scopes.length * 100)) : 0;
    const finalized = roundRows.filter((row) => String(row.workflow_status) === "FINALIZED").length;
    const status = statusBars(roundRows.map((row) => String(row.workflow_status || "DRAFT")));
    return <><style>{CSS}</style><Kpis items={[
      { label: "Đợt tự đánh giá", value: rows.length, note: "Trong năm đang chọn" },
      { label: "Tiêu chí trong phạm vi", value: scopes.length, note: "Tổng scope đã cấu hình" },
      { label: "Đã gửi đánh giá", value: `${completion}%`, note: `${submitted}/${scopes.length || 0} tiêu chí` },
      { label: "Đợt đã chốt", value: finalized, note: "Đã qua kiểm tra chéo" },
    ]}/><section className="assessment-tqm-grid"><article className="panel"><div className="assessment-tqm-head"><h2>Mức hoàn thành tự đánh giá</h2><p>Tính trên số tiêu chí đã gửi/được rà soát so với toàn bộ phạm vi đánh giá.</p></div><TqmDonut value={completion} label="Hoàn thành" segments={[{ label: "Đã gửi", value: submitted, tone: "green" }, { label: "Còn lại", value: Math.max(0, scopes.length - submitted), tone: "slate" }]}/></article><article className="panel"><div className="assessment-tqm-head"><h2>Đợt đánh giá theo giai đoạn</h2><p>Cho biết các đợt đang ở bước đơn vị tự đánh giá, kiểm tra chéo hay đã chốt.</p></div><TqmHorizontalBars rows={status}/></article></section><section className="panel"><div className="assessment-tqm-head"><h2>Nhịp cập nhật tự đánh giá 12 tháng</h2><p>Dùng để nhận diện giai đoạn tập trung cập nhật hồ sơ và bằng chứng.</p></div><TqmTrend points={monthPoints(rows)} unit=""/></section></>;
  }

  if (recordType === "EXTERNAL_ASSESSMENT") {
    const [comparisonResult, findingLinkResult] = await Promise.all([
      supabase.from("record_links").select("source_record_id,target_record_id").in("source_record_id", recordIds).eq("relation_type", "COMPARED_WITH_SELF"),
      supabase.from("record_links").select("source_record_id,target_record_id,metadata").in("source_record_id", recordIds).eq("relation_type", "GENERATED_FINDING"),
    ]);
    const comparisons = (comparisonResult.data ?? []) as any[];
    const findingLinks = (findingLinkResult.data ?? []) as any[];
    const findingRecordIds = findingLinks.map((row) => row.target_record_id).filter(Boolean);
    const { data: findings } = findingRecordIds.length ? await supabase.from("findings").select("record_id,workflow_status,severity").in("record_id", findingRecordIds) : { data: [] as any[] };
    const findingRows = (findings ?? []) as any[];
    const open = findingRows.filter((row) => !["CLOSED", "CANCELLED"].includes(String(row.workflow_status))).length;
    const linkedRate = rows.length ? Math.round(comparisons.length / rows.length * 100) : 0;
    const severity = new Map<string, number>(); findingRows.forEach((row) => severity.set(String(row.severity || "UNKNOWN"), (severity.get(String(row.severity || "UNKNOWN")) || 0) + 1));
    const severityBars = Array.from(severity.entries()).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({ label: label.replaceAll("_"," "), value, tone: (label === "CRITICAL" ? "red" : label === "MAJOR" ? "amber" : "blue") as Tone }));
    const closed = Math.max(0, findingRows.length - open);
    return <><style>{CSS}</style><Kpis items={[
      { label: "Đợt đánh giá ngoài", value: rows.length, note: "Hồ sơ đoàn ngoài" },
      { label: "Đã khóa self để đối chiếu", value: `${linkedRate}%`, note: `${comparisons.length}/${rows.length} đợt` },
      { label: "Chênh lệch sinh Finding", value: findingRows.length, note: "Giữ nguyên điểm self gốc" },
      { label: "Finding còn mở", value: open, note: "Cần khắc phục/recheck" },
    ]}/><section className="assessment-tqm-grid"><article className="panel"><div className="assessment-tqm-head"><h2>Khép vòng chênh lệch Self ↔ Đoàn ngoài</h2><p>Mỗi chênh lệch được chuyển thành Finding để giữ truy vết đến khi recheck và đóng.</p></div><TqmDonut value={findingRows.length ? Math.round(closed/findingRows.length*100) : 0} label="Finding đã đóng" segments={[{label:"Đã đóng",value:closed,tone:"green"},{label:"Còn mở",value:open,tone:"red"}]}/></article><article className="panel"><div className="assessment-tqm-head"><h2>Mức độ Finding do đoàn ngoài</h2><p>Ưu tiên các chênh lệch nghiêm trọng/tới hạn trước khi chốt đối chiếu.</p></div><TqmHorizontalBars rows={severityBars}/></article></section><section className="panel"><div className="assessment-tqm-head"><h2>Nhịp xử lý đánh giá ngoài</h2><p>Số hồ sơ có cập nhật theo tháng để theo dõi giai đoạn cao điểm.</p></div><TqmTrend points={monthPoints(rows)} unit=""/></section></>;
  }

  if (recordType === "AUDIT") {
    const { data: audits } = await supabase.from("audits").select("id,record_id,workflow_status").in("record_id", recordIds);
    const auditRows = (audits ?? []) as any[];
    const auditIds = auditRows.map((row) => row.id);
    const [scopeResult, sessionResult, linkResult] = await Promise.all([
      auditIds.length ? supabase.from("audit_scopes").select("id,audit_id").in("audit_id", auditIds) : Promise.resolve({ data: [] as any[] }),
      auditIds.length ? supabase.from("audit_sessions").select("id,audit_id").in("audit_id", auditIds) : Promise.resolve({ data: [] as any[] }),
      auditIds.length ? supabase.from("audit_finding_links").select("audit_id,finding_id").in("audit_id", auditIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const scopes = (scopeResult.data ?? []) as any[]; const sessions = (sessionResult.data ?? []) as any[]; const links = (linkResult.data ?? []) as any[];
    const findingIds = links.map((row) => row.finding_id).filter(Boolean);
    const { data: findings } = findingIds.length ? await supabase.from("findings").select("id,workflow_status,severity").in("id", findingIds) : { data: [] as any[] };
    const findingRows = (findings ?? []) as any[]; const open = findingRows.filter((row) => !["CLOSED","CANCELLED"].includes(String(row.workflow_status))).length;
    const closedAudits = auditRows.filter((row)=>String(row.workflow_status)==="CLOSED").length;
    const status = statusBars(auditRows.map((row)=>String(row.workflow_status||"DRAFT")));
    return <><style>{CSS}</style><Kpis items={[
      {label:"Audit / Tracer",value:rows.length,note:"Đợt trong năm"},
      {label:"Phạm vi audit",value:scopes.length,note:"Scope đã cấu hình"},
      {label:"Phiên thực hiện",value:sessions.length,note:"Session có ghi nhận"},
      {label:"Finding còn mở",value:open,note:`${findingRows.length} Finding phát sinh`},
    ]}/><section className="assessment-tqm-grid"><article className="panel"><div className="assessment-tqm-head"><h2>Khép vòng Audit / Tracer</h2><p>Audit chỉ đóng sau khi các Finding liên quan đã được follow-up và recheck.</p></div><TqmDonut value={auditRows.length?Math.round(closedAudits/auditRows.length*100):0} label="Audit đã đóng" segments={[{label:"Đã đóng",value:closedAudits,tone:"green"},{label:"Đang mở",value:Math.max(0,auditRows.length-closedAudits),tone:"amber"}]}/></article><article className="panel"><div className="assessment-tqm-head"><h2>Audit theo bước workflow</h2><p>Từ chuẩn bị phạm vi → thực hiện → rà soát báo cáo → follow-up.</p></div><TqmHorizontalBars rows={status}/></article></section><section className="panel"><div className="assessment-tqm-head"><h2>Nhịp Audit / Tracer 12 tháng</h2><p>Quan sát mức độ triển khai hoạt động kiểm tra nội bộ trong năm.</p></div><TqmTrend points={monthPoints(rows)} unit=""/></section></>;
  }

  if (recordType === "INSPECTION") {
    const { data: events } = await supabase.from("inspection_events").select("id,record_id,visit_date,workflow_status").in("record_id", recordIds);
    const eventRows = (events ?? []) as any[]; const eventIds = eventRows.map((row)=>row.id);
    const { data: links } = eventIds.length ? await supabase.from("inspection_action_links").select("inspection_event_id,action_id,offset_days").in("inspection_event_id", eventIds) : { data: [] as any[] };
    const linkRows = (links ?? []) as any[]; const actionIds = linkRows.map((row)=>row.action_id).filter(Boolean);
    const { data: actions } = actionIds.length ? await supabase.from("actions").select("id,workflow_status,due_date").in("id", actionIds) : { data: [] as any[] };
    const actionRows = (actions ?? []) as any[]; const actionMap = new Map(actionRows.map((row)=>[row.id,row]));
    const today = new Date().toISOString().slice(0,10); const completed = actionRows.filter((row)=>ACTION_DONE.has(String(row.workflow_status))).length;
    const overdue = actionRows.filter((row)=>row.due_date && row.due_date < today && !ACTION_DONE.has(String(row.workflow_status))).length;
    const upcoming = eventRows.filter((row)=>row.visit_date && row.visit_date >= today).sort((a,b)=>String(a.visit_date).localeCompare(String(b.visit_date)))[0];
    const offsets=[-30,-14,-7,-3,-1,0,1,7];
    const milestoneStats=offsets.map((offset)=>{const ls=linkRows.filter((row)=>Number(row.offset_days)===offset);const done=ls.filter((row)=>ACTION_DONE.has(String(actionMap.get(row.action_id)?.workflow_status))).length;const late=ls.filter((row)=>{const a=actionMap.get(row.action_id);return a?.due_date&&a.due_date<today&&!ACTION_DONE.has(String(a.workflow_status))}).length;return{offset,total:ls.length,done,late};});
    const status = statusBars(eventRows.map((row)=>String(row.workflow_status||"PLANNING")));
    const progress = actionRows.length ? Math.round(completed/actionRows.length*100) : 0;
    return <><style>{CSS}</style><Kpis items={[
      {label:"Đợt tiếp đoàn",value:rows.length,note:"Đang quản lý trong năm"},
      {label:"Countdown Action",value:actionRows.length,note:"D-30 → D+7"},
      {label:"Hoàn thành countdown",value:`${progress}%`,note:`${completed}/${actionRows.length||0} Action`},
      {label:"Mốc quá hạn",value:overdue,note:upcoming?`Đợt gần nhất ${upcoming.visit_date}`:"Không có đợt sắp tới"},
    ]}/><section className="panel"><div className="assessment-tqm-head"><h2>Inspection Mode · Countdown readiness</h2><p>Mỗi mốc chỉ được coi hoàn tất khi Action tương ứng đạt gate nghiệp vụ; đỏ là mốc đang trễ.</p></div><div className="inspection-strip">{milestoneStats.map((m)=>{const label=m.offset<0?`D${m.offset}`:m.offset===0?"D-Day":`D+${m.offset}`;const cls=m.late?"late":m.total>0&&m.done===m.total?"done":"due";return <div className={`inspection-milestone ${cls}`} key={m.offset}><strong>{label}</strong><span>{m.done}/{m.total}</span><small>{m.late?`${m.late} trễ`:m.total?"Action hoàn thành":"Chưa sinh mốc"}</small></div>})}</div></section><section className="assessment-tqm-grid"><article className="panel"><div className="assessment-tqm-head"><h2>Mức sẵn sàng tiếp đoàn</h2><p>Tỷ lệ countdown Action đã hoàn thành trên toàn bộ các đợt đang quản lý.</p></div><TqmDonut value={progress} label="Sẵn sàng" segments={[{label:"Hoàn thành",value:completed,tone:"green"},{label:"Còn lại",value:Math.max(0,actionRows.length-completed),tone:overdue?"red":"amber"}]}/></article><article className="panel"><div className="assessment-tqm-head"><h2>Đợt tiếp đoàn theo giai đoạn</h2><p>Planning → Preparation → On-site → Follow-up → Closed.</p></div><TqmHorizontalBars rows={status}/></article></section></>;
  }

  return null;
}
