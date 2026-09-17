import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars } from "@/components/tqm-charts";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

const FINAL_STATUSES = new Set(["VERIFIED", "LOCKED"]);
const NEED_ENTRY = new Set(["DRAFT", "RETURNED"]);

function n(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: unknown, unit?: string | null) {
  const parsed = n(value);
  if (parsed === null) return "—";
  return `${parsed.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

export default async function IndicatorsPage({ searchParams }: { searchParams: Promise<{ status?: string; result?: string; definition?: string; source?: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"])) redirect("/dashboard?forbidden=1");
  const year = await getWorkYear();
  const filters = await searchParams;
  const supabase = await createClient();

  const [recordsRes, measurementsRes, definitionsRes] = await Promise.all([
    supabase.from("records").select("id,record_code,title,lifecycle_status,owner_department_id,owner_user_id,updated_at").eq("record_type", "INDICATOR_MEASUREMENT").eq("work_year", year).neq("lifecycle_status", "CANCELLED"),
    supabase.from("indicator_measurements").select("id,record_id,indicator_assignment_id,period_start,period_end,numerator_value,denominator_value,raw_value,calculated_value,source_mode,workflow_status,result_level,submitted_at,verified_at,locked_at,updated_at").order("period_end", { ascending: false }),
    supabase.from("indicator_definitions").select("id,code,name,quality_dimension,is_active").eq("is_active", true).order("name"),
  ]);

  const records = (recordsRes.data ?? []) as any[];
  const recordMap = new Map(records.map((x: any) => [x.id, x]));
  const measurements = ((measurementsRes.data ?? []) as any[]).filter((x: any) => recordMap.has(x.record_id));
  const assignmentIds = Array.from(new Set(measurements.map((x: any) => x.indicator_assignment_id).filter(Boolean)));
  const assignmentsRes = assignmentIds.length
    ? await supabase.from("indicator_assignments").select("id,indicator_version_id,department_id,collector_user_id,work_year,frequency,local_target,status").in("id", assignmentIds)
    : { data: [] as any[], error: null };
  const assignments = (assignmentsRes.data ?? []) as any[];
  const assignmentMap = new Map(assignments.map((x: any) => [x.id, x]));
  const versionIds = Array.from(new Set(assignments.map((x: any) => x.indicator_version_id).filter(Boolean)));
  const versionsRes = versionIds.length
    ? await supabase.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,calculation_type,desired_direction,frequency,unit,multiplier,status").in("id", versionIds)
    : { data: [] as any[], error: null };
  const versions = (versionsRes.data ?? []) as any[];
  const versionMap = new Map(versions.map((x: any) => [x.id, x]));
  const definitionIds = Array.from(new Set(versions.map((x: any) => x.indicator_definition_id).filter(Boolean)));
  const selectedDefinitions = ((definitionsRes.data ?? []) as any[]).filter((x: any) => definitionIds.includes(x.id));
  const definitionMap = new Map(selectedDefinitions.map((x: any) => [x.id, x]));

  const departmentIds = Array.from(new Set(assignments.map((x: any) => x.department_id).filter(Boolean)));
  const collectorIds = Array.from(new Set(assignments.map((x: any) => x.collector_user_id).filter(Boolean)));
  const [departmentsRes, collectorsRes] = await Promise.all([
    departmentIds.length ? supabase.from("departments").select("id,name,short_name").in("id", departmentIds) : Promise.resolve({ data: [] as any[], error: null }),
    collectorIds.length ? supabase.from("profiles").select("user_id,full_name,email").in("user_id", collectorIds) : Promise.resolve({ data: [] as any[], error: null }),
  ] as any);
  const departmentMap = new Map(((departmentsRes.data ?? []) as any[]).map((x: any) => [x.id, x.short_name || x.name]));
  const collectorMap = new Map(((collectorsRes.data ?? []) as any[]).map((x: any) => [x.user_id, x.full_name || x.email]));

  const allRows = measurements.map((m: any) => {
    const r: any = recordMap.get(m.record_id);
    const a: any = assignmentMap.get(m.indicator_assignment_id);
    const v: any = a ? versionMap.get(a.indicator_version_id) : null;
    const d: any = v ? definitionMap.get(v.indicator_definition_id) : null;
    return {
      ...m,
      record_code: r?.record_code,
      title: r?.title,
      definition_id: d?.id,
      definition_code: d?.code,
      definition_name: d?.name || r?.title || "Chỉ số chưa định danh",
      quality_dimension: d?.quality_dimension,
      unit: v?.unit,
      calculation_type: v?.calculation_type,
      desired_direction: v?.desired_direction,
      frequency: a?.frequency || v?.frequency,
      local_target: a?.local_target,
      department: a?.department_id ? departmentMap.get(a.department_id) : "Toàn viện",
      collector: a?.collector_user_id ? collectorMap.get(a.collector_user_id) : "Chưa gán",
    };
  });

  const rows = allRows.filter((x: any) => {
    if (filters.status && x.workflow_status !== filters.status) return false;
    if (filters.result && x.result_level !== filters.result) return false;
    if (filters.definition && x.definition_id !== filters.definition) return false;
    if (filters.source && String(x.source_mode || "") !== filters.source) return false;
    return true;
  });

  const activeAssignments = assignments.filter((x: any) => x.status === "ACTIVE").length;
  const needEntry = allRows.filter((x: any) => NEED_ENTRY.has(String(x.workflow_status))).length;
  const pendingVerify = allRows.filter((x: any) => x.workflow_status === "SUBMITTED").length;
  const locked = allRows.filter((x: any) => x.workflow_status === "LOCKED").length;
  const finalRows = allRows.filter((x: any) => FINAL_STATUSES.has(String(x.workflow_status)));
  const outOfTarget = finalRows.filter((x: any) => x.result_level === "OUT_OF_TARGET").length;
  const finalEvaluated = finalRows.filter((x: any) => ["MEETS_TARGET", "OUT_OF_TARGET"].includes(String(x.result_level))).length;
  const meetRate = finalEvaluated ? Math.round((finalEvaluated - outOfTarget) / finalEvaluated * 100) : 0;

  const outByDefinition = new Map<string, { label: string; value: number }>();
  for (const x of finalRows) {
    if (x.result_level !== "OUT_OF_TARGET") continue;
    const key = x.definition_id || x.definition_name;
    const current = outByDefinition.get(key) || { label: `${x.definition_code ? `${x.definition_code} · ` : ""}${x.definition_name}`, value: 0 };
    current.value += 1;
    outByDefinition.set(key, current);
  }
  const riskBars = Array.from(outByDefinition.values()).sort((a, b) => b.value - a.value).slice(0, 10).map((x) => ({ ...x, tone: "red" as const, caption: "kỳ đo lệch mục tiêu" }));

  const statusCounts = new Map<string, number>();
  for (const x of allRows) statusCounts.set(String(x.workflow_status), (statusCounts.get(String(x.workflow_status)) ?? 0) + 1);
  const statusSegments = [
    { label: "Cần nhập/sửa", value: (statusCounts.get("DRAFT") ?? 0) + (statusCounts.get("RETURNED") ?? 0), tone: "amber" as const },
    { label: "Chờ xác minh", value: statusCounts.get("SUBMITTED") ?? 0, tone: "blue" as const },
    { label: "Đã xác minh", value: statusCounts.get("VERIFIED") ?? 0, tone: "brand" as const },
    { label: "Đã khóa", value: statusCounts.get("LOCKED") ?? 0, tone: "green" as const },
  ];
  const sourceOptions = Array.from(new Set(allRows.map((x: any) => String(x.source_mode || "")).filter(Boolean))).sort();
  const firstError = [recordsRes, measurementsRes, definitionsRes, assignmentsRes, versionsRes, departmentsRes, collectorsRes].find((x: any) => x?.error)?.error;

  return <div className="page-stack indicator-platform">
    <style>{TQM_CHART_CSS + `.indicator-platform .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.indicator-platform .kpi{background:#fff;border:1px solid #e1e9ec;border-radius:16px;padding:15px}.indicator-platform .kpi span{font-size:9px;color:#718187;font-weight:850;text-transform:uppercase}.indicator-platform .kpi strong{display:block;font-size:27px;margin-top:7px}.indicator-platform .kpi small{font-size:9px;color:#7d8c92}.indicator-platform .grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.indicator-platform .head{padding:17px 18px 7px}.indicator-platform .head h2{margin:0;font-size:15px}.indicator-platform .head p{margin:4px 0 0;color:#74838a;font-size:11px}.indicator-platform .filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:8px;padding:14px}.indicator-platform .filters label{display:grid;gap:4px;font-size:10px;font-weight:800;color:#607279}.indicator-platform .filters select{width:100%}.indicator-platform .rows{display:grid;gap:8px;padding:8px 16px 16px}.indicator-platform .row{display:grid;grid-template-columns:minmax(220px,1.7fr) 130px 115px 110px 115px auto;gap:10px;align-items:center;padding:12px;border:1px solid #e4eaec;border-radius:13px}.indicator-platform .row strong{font-size:11px}.indicator-platform .row small{display:block;color:#7a898f;margin-top:3px;font-size:9.5px}.indicator-platform .out{border-color:#f1c0c5;background:#fffafb}.indicator-platform .warn{color:#b42318}.indicator-platform .ok{color:#16825d}@media(max-width:1050px){.indicator-platform .kpis{grid-template-columns:repeat(3,1fr)}.indicator-platform .grid{grid-template-columns:1fr}.indicator-platform .row{grid-template-columns:1fr 1fr 1fr}.indicator-platform .row>div:first-child{grid-column:1/-1}}@media(max-width:700px){.indicator-platform .kpis{grid-template-columns:1fr 1fr}.indicator-platform .filters{grid-template-columns:1fr}.indicator-platform .row{grid-template-columns:1fr 1fr}.indicator-platform .row>div:first-child{grid-column:1/-1}}`}</style>
    <PageHeader eyebrow={`ĐO LƯỜNG & GIÁM SÁT · ${year}`} title="Chỉ số chất lượng" description="Màn hình điều hành kỳ đo: biết kỳ nào phải nhập, kỳ nào chờ xác minh, chỉ số nào lệch mục tiêu và đi thẳng vào hồ sơ cần xử lý. Dữ liệu nhập tay vẫn là luồng chuẩn; không phụ thuộc HIS/EMR." />
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <section className="kpis">
      <article className="kpi"><span>Chỉ số đang phân công</span><strong>{activeAssignments}</strong><small>Assignment đang ACTIVE</small></article>
      <article className="kpi"><span>Cần nhập / sửa</span><strong>{needEntry}</strong><small>Nháp hoặc bị trả lại</small></article>
      <article className="kpi"><span>Chờ xác minh</span><strong>{pendingVerify}</strong><small>Đã gửi, chưa kiểm tra</small></article>
      <article className="kpi"><span>Đã khóa số liệu</span><strong>{locked}</strong><small>Kỳ đo đã chốt</small></article>
      <article className="kpi"><span>Lệch mục tiêu</span><strong className={outOfTarget ? "warn" : ""}>{outOfTarget}</strong><small>Trong kỳ đã xác minh/khóa</small></article>
      <article className="kpi"><span>Tỷ lệ đạt mục tiêu</span><strong className={meetRate >= 80 ? "ok" : ""}>{meetRate}%</strong><small>{finalEvaluated} kỳ có thể đánh giá</small></article>
    </section>

    <section className="grid">
      <article className="panel"><div className="head"><h2>Chỉ số cần ưu tiên phân tích</h2><p>Xếp theo số kỳ đã xác minh/khóa nhưng lệch mục tiêu; không cộng gộp giá trị khác đơn vị.</p></div>{riskBars.length ? <TqmHorizontalBars rows={riskBars} /> : <div className="empty-state">Chưa có kỳ đo lệch mục tiêu.</div>}</article>
      <article className="panel"><div className="head"><h2>Trạng thái vận hành kỳ đo</h2><p>Nhập → xác minh → khóa dữ liệu.</p></div><TqmDonut value={meetRate} label="đạt mục tiêu" segments={statusSegments} /></article>
    </section>

    <section className="panel">
      <div className="head"><h2>Hàng đợi kỳ đo</h2><p>Lọc theo trạng thái, kết quả, chỉ số hoặc nguồn dữ liệu. Hồ sơ lệch mục tiêu được đánh dấu để mở trực tiếp và tạo Action/CAPA khi cần.</p></div>
      <form className="filters" method="get">
        <label>Trạng thái<select name="status" defaultValue={filters.status || ""}><option value="">Tất cả</option><option value="DRAFT">Nháp</option><option value="RETURNED">Bị trả lại</option><option value="SUBMITTED">Chờ xác minh</option><option value="VERIFIED">Đã xác minh</option><option value="LOCKED">Đã khóa</option></select></label>
        <label>Kết quả<select name="result" defaultValue={filters.result || ""}><option value="">Tất cả</option><option value="OUT_OF_TARGET">Lệch mục tiêu</option><option value="MEETS_TARGET">Đạt mục tiêu</option><option value="NOT_EVALUATED">Chưa đánh giá</option></select></label>
        <label>Chỉ số<select name="definition" defaultValue={filters.definition || ""}><option value="">Tất cả</option>{selectedDefinitions.map((d: any) => <option key={d.id} value={d.id}>{d.code ? `${d.code} · ` : ""}{d.name}</option>)}</select></label>
        <label>Nguồn dữ liệu<select name="source" defaultValue={filters.source || ""}><option value="">Tất cả</option>{sourceOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <button className="button secondary" type="submit">Áp dụng</button>
      </form>
      <div className="rows">
        {rows.map((x: any) => <div className={`row ${x.result_level === "OUT_OF_TARGET" ? "out" : ""}`} key={x.id}>
          <div><strong>{x.definition_code ? `${x.definition_code} · ` : ""}{x.definition_name}</strong><small>{x.department || "—"} · {x.period_start} → {x.period_end}</small></div>
          <div><strong>{fmt(x.calculated_value ?? x.raw_value, x.unit)}</strong><small>Mục tiêu: {fmt(x.local_target, x.unit)}</small></div>
          <div><StatusBadge status={x.workflow_status} /></div>
          <div><strong className={x.result_level === "OUT_OF_TARGET" ? "warn" : x.result_level === "MEETS_TARGET" ? "ok" : ""}>{x.result_level === "OUT_OF_TARGET" ? "Không đạt" : x.result_level === "MEETS_TARGET" ? "Đạt" : "Chưa đánh giá"}</strong><small>{x.calculation_type || "—"}</small></div>
          <div><strong>{x.collector || "Chưa gán"}</strong><small>{x.source_mode || "Nhập thủ công"}</small></div>
          <Link className="button tertiary small" href={`/indicators/measurements/${x.record_id}`}>Mở kỳ đo</Link>
        </div>)}
        {!rows.length ? <div className="empty-state">Không có kỳ đo phù hợp bộ lọc.</div> : null}
      </div>
    </section>
  </div>;
}
