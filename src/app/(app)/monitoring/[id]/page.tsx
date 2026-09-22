import { notFound, redirect } from "next/navigation";
import { FiveSChecklistRunClient } from "@/components/five-s-checklist-run-client";
import { GenericChecklistRunClient } from "@/components/generic-checklist-run-client";
import { MonitoringBackButton } from "@/components/monitoring-back-button";
import { MonitoringConfirmClient } from "@/components/monitoring-confirm-client";
import { MonitoringPrintClient } from "@/components/monitoring-print-client";
import { MonitoringRecheckClient } from "@/components/monitoring-recheck-client";
import { MonitoringStartClient } from "@/components/monitoring-start-client";
import { PageHeader } from "@/components/page-header";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const RESULT_LABELS: Record<string, string> = { PASS: "Đạt", FAIL: "Không đạt", NA: "/", NOT_ASSESSED: "Chưa đánh giá" };

function formatHcmDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function PhotoList({ title, photos }: { title: string; photos: any[] }) {
  if (!photos?.length) return null;
  return <div className="monitoring-photo-group"><div className="subline monitoring-photo-title"><strong>{title}</strong></div><div className="monitoring-photo-list">{photos.map((photo: any, index: number) => <div key={photo.evidence_id || index} className="monitoring-photo-item"><a href={`/api/monitoring/evidence/${photo.evidence_id}`} target="_blank" rel="noreferrer"><img src={`/api/monitoring/evidence/${photo.evidence_id}`} alt={title} /></a><small className="muted">{photo.latitude != null ? `${Number(photo.latitude).toFixed(5)}, ${Number(photo.longitude).toFixed(5)}` : "Không có GPS"}</small></div>)}</div></div>;
}

function SignatureFooter({ assessorName, confirmation, isConfirmed }: { assessorName: string | null; confirmation: any; isConfirmed: boolean }) {
  return <section className="panel signature-footer">
    <div className="signature-grid">
      <div><strong>NGƯỜI GIÁM SÁT 5S</strong><div className="signature-caption">(Ký và ghi rõ họ tên)</div><div className="signature-space" /><strong>{assessorName || ""}</strong></div>
      <div><strong>PHÒNG QLCL</strong><div className="signature-caption">(Ký và ghi rõ họ tên)</div><div className="signature-space" /><strong>{confirmation?.full_name || ""}</strong>{confirmation?.confirmed_at ? <div className="signature-system-note">Xác nhận trên hệ thống: {formatHcmDateTime(confirmation.confirmed_at)}</div> : isConfirmed ? <div className="signature-system-note">Đã xác nhận trên hệ thống</div> : <div className="signature-system-note">Chưa xác nhận trên hệ thống</div>}</div>
    </div>
  </section>;
}

export default async function MonitoringRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["monitoring.view", "monitoring.perform", "checklists.manage"])) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const supabase = await createClient();

  const { data: round, error: roundError } = await supabase.from("monitoring_rounds")
    .select("id,record_id,checklist_version_id,work_year,scheduled_date,started_at,completed_at,target_department_id,target_area,lead_assessor_id,workflow_status")
    .eq("id", id).maybeSingle();
  if (roundError) return <div className="alert error">Không tải được đợt giám sát: {roundError.message}</div>;
  if (!round) notFound();

  const [recordRes, versionRes, responsesRes, assessorRes, itemsRes, sectionsRes] = await Promise.all([
    supabase.from("records").select("id,record_code,title,lifecycle_status").eq("id", round.record_id).maybeSingle(),
    supabase.from("checklist_versions").select("id,checklist_template_id,version_no,status").eq("id", round.checklist_version_id).maybeSingle(),
    supabase.from("checklist_responses").select("id,checklist_item_id,result_status,score,note,answer_value,answered_at").eq("monitoring_round_id", round.id),
    round.lead_assessor_id ? supabase.from("profiles").select("user_id,full_name").eq("user_id", round.lead_assessor_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("checklist_items").select("id,checklist_version_id,section_id,content,sequence_no,metadata,answer_type,allow_na").eq("checklist_version_id", round.checklist_version_id).order("sequence_no", { ascending: true }),
    supabase.from("checklist_sections").select("id,checklist_version_id,title,sequence_no").eq("checklist_version_id", round.checklist_version_id).order("sequence_no", { ascending: true }),
  ]);

  const version = versionRes.data as any;
  const templateRes = version?.checklist_template_id ? await supabase.from("checklist_templates").select("id,code,name").eq("id", version.checklist_template_id).maybeSingle() : { data: null, error: null };
  const itemIdsForOptions = (itemsRes.data ?? []).map((x: any) => x.id);
  const optionsRes = itemIdsForOptions.length
    ? await supabase.from("checklist_item_options").select("id,checklist_item_id,option_code,option_label,option_value,sort_order").in("checklist_item_id", itemIdsForOptions).order("sort_order", { ascending: true })
    : { data: [], error: null };
  const firstError = [recordRes, versionRes, responsesRes, assessorRes, templateRes, itemsRes, sectionsRes, optionsRes].find((x: any) => x.error)?.error;
  const record = recordRes.data as any;
  const template = templateRes.data as any;
  const optionsByItem = new Map<string, any[]>();
  for (const opt of (optionsRes.data ?? []) as any[]) optionsByItem.set(opt.checklist_item_id, [...(optionsByItem.get(opt.checklist_item_id) ?? []), opt]);

  const responseMap = new Map((responsesRes.data ?? []).map((x: any) => [x.checklist_item_id, x]));
  const sectionMap = new Map((sectionsRes.data ?? []).map((x: any) => [x.id, x]));
  const rows = (itemsRes.data ?? []).map((item: any) => ({ item, response: responseMap.get(item.id), section: sectionMap.get(item.section_id) }))
    .sort((a: any, b: any) => Number(a.section?.sequence_no ?? 0) - Number(b.section?.sequence_no ?? 0) || Number(a.item.sequence_no ?? 0) - Number(b.item.sequence_no ?? 0));
  const structure = (sectionsRes.data ?? []).map((section: any) => ({ ...section, items: (itemsRes.data ?? []).filter((item: any) => item.section_id === section.id).map((item: any) => ({ ...item, options: optionsByItem.get(item.id) ?? [] })) }));

  const hasResponses = (responsesRes.data ?? []).length > 0;
  const responseValues = (responsesRes.data ?? []).map((x: any) => x?.answer_value).filter((x: any) => x && typeof x === "object");
  const context = responseValues.find((x: any) => x?.form_context)?.form_context ?? {};
  const confirmation = responseValues.find((x: any) => x?.qlcl_confirmation)?.qlcl_confirmation ?? null;
  const isConfirmed = ["CONFIRMED", "CLOSED"].includes(round.workflow_status);
  const assessorName = (assessorRes.data as any)?.full_name || context.assessor_name || null;
  const passCount = rows.filter((x: any) => x.response?.result_status === "PASS").length;
  const failCount = rows.filter((x: any) => x.response?.result_status === "FAIL").length;
  const naCount = rows.filter((x: any) => x.response?.result_status === "NA").length;
  const denominator = passCount + failCount;
  const compliance = denominator ? Math.round((passCount / denominator) * 1000) / 10 : 0;
  const waitingRecheck = round.workflow_status === "IN_PROGRESS" && hasResponses && rows.some((x: any) => x.response?.result_status === "FAIL" && x.response?.answer_value?.followup?.status === "PENDING_RECHECK");
  const activeScoring = round.workflow_status === "IN_PROGRESS" && !hasResponses;
  const scheduled = round.workflow_status === "SCHEDULED";
  const phaseLabel = scheduled ? "Cần kiểm" : activeScoring ? "Đang kiểm" : waitingRecheck ? "Chờ kiểm lại" : round.workflow_status === "AWAITING_CONFIRMATION" ? "Chờ QLCL xác nhận" : round.workflow_status === "CONFIRMED" ? "Đã xác nhận" : round.workflow_status === "CLOSED" ? "Đã đóng" : round.workflow_status === "CANCELLED" ? "Đã hủy" : round.workflow_status;
  const phaseTone = scheduled ? "warning" : activeScoring ? "info" : waitingRecheck ? "danger" : round.workflow_status === "AWAITING_CONFIRMATION" ? "warning" : isConfirmed ? "success" : "muted";

  const recheckRows = rows.filter((x: any) => x.response?.result_status === "FAIL" && x.response?.answer_value?.followup?.status === "PENDING_RECHECK").map((x: any) => ({
    responseId: x.response.id,
    itemContent: x.item.content,
    sectionTitle: x.section?.title || "—",
    reportedAt: x.response?.answer_value?.followup?.reported_at || null,
    dueAt: x.response?.answer_value?.followup?.recheck_due_at || null,
  }));

  return <div className="page-stack monitoring-round-page">
    <style>{`
      .monitoring-sticky-actions{position:sticky;top:74px;z-index:35;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:7px 0;background:linear-gradient(to bottom,rgba(244,248,249,.98),rgba(244,248,249,.90),rgba(244,248,249,0));backdrop-filter:blur(5px)}
      .monitoring-photo-group{margin-top:7px}.monitoring-photo-title{margin-bottom:4px}.monitoring-photo-list{display:flex;gap:8px;flex-wrap:wrap}.monitoring-photo-item{width:132px}.monitoring-photo-item img{width:132px;height:96px;object-fit:cover;border-radius:7px;border:1px solid #dfe6e9}.monitoring-photo-item small{display:block;margin-top:3px;font-size:10px;line-height:1.2}
      .signature-footer{padding:14px;break-inside:avoid}.signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;text-align:center}.signature-caption{font-size:11px;margin-top:3px}.signature-space{min-height:62px}.signature-system-note{font-size:10px;margin-top:3px}
      .monitoring-result-mobile{display:none}
      @media(max-width:760px){
        .monitoring-sticky-actions{top:72px;padding:7px 0 9px}.monitoring-sticky-actions .button{min-height:40px}
        .monitoring-round-page{gap:10px!important}.monitoring-round-page .page-header h1{font-size:23px!important;line-height:1.25!important}
        .monitoring-round-page .kpi-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}
        .monitoring-round-page .kpi-card{min-height:90px!important;padding:11px!important}
        .monitoring-result-desktop{display:none!important}.monitoring-result-mobile{display:grid;gap:10px;padding:0 12px 12px}
        .monitoring-result-card{border:1px solid #dce6e7;border-radius:14px;padding:13px;background:#fff;display:grid;gap:9px}
        .monitoring-result-card.fail{border-color:#f0c4c4;background:#fffafa}
        .monitoring-result-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.monitoring-result-card-head strong{color:#1d3f73;font-size:13px}
        .monitoring-result-card-content{font-size:16px;line-height:1.42;font-weight:650;color:#263238}
        .monitoring-result-card-note{font-size:13px;line-height:1.45;color:#59686e}
        .monitoring-result-card .monitoring-photo-item{width:132px}.monitoring-result-card .monitoring-photo-item img{width:132px;height:96px}
        .signature-grid{gap:14px}.signature-space{min-height:48px}
      }
      @media print{
        @page{size:A4;margin:7mm}
        .sidebar,.topbar,.no-print{display:none!important}.main-shell{margin-left:0!important}.content{padding:0!important;max-width:none!important}.page-stack{gap:5px!important}
        .monitoring-round-page{font-size:9px!important}.monitoring-round-page .page-header{margin:0 0 4px!important}.monitoring-round-page .page-header h1{font-size:16px!important;line-height:1.15!important;margin:2px 0!important}.monitoring-round-page .page-header p{font-size:9px!important;margin:1px 0!important}
        .monitoring-status-panel,.monitoring-info-panel{padding:7px 9px!important;border-radius:8px!important}.monitoring-status-panel strong{font-size:13px!important}.monitoring-status-panel .subline{font-size:8.5px!important}
        .monitoring-round-page .kpi-grid.print-kpis{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important}.monitoring-round-page .kpi-card{min-height:0!important;padding:6px 8px!important;border-radius:7px!important;box-shadow:none!important}.monitoring-round-page .kpi-card span{font-size:8px!important}.monitoring-round-page .kpi-card strong{font-size:16px!important;margin:2px 0!important}.monitoring-round-page .kpi-card small{font-size:7.5px!important;line-height:1.15!important}
        .monitoring-info-panel .form-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}.monitoring-info-panel .eyebrow{font-size:7.5px!important}.monitoring-info-panel strong{font-size:9px!important}.monitoring-info-panel .scope-note{padding:4px 6px!important;margin-top:5px!important;font-size:8px!important}
        .panel{box-shadow:none!important}.print-results-panel{break-inside:auto!important}.print-results-panel .panel-title{padding:7px 9px!important}.print-results-panel .panel-title h2{font-size:12px!important}.print-results-panel .panel-title p{font-size:8px!important;margin-top:1px!important}.print-results-panel .table-wrap{overflow:visible!important}.print-results-panel table{font-size:8px!important;table-layout:fixed;width:100%}.print-results-panel th,.print-results-panel td{padding:3px 4px!important;vertical-align:top!important;line-height:1.22!important}.print-results-panel th:nth-child(1){width:4%}.print-results-panel th:nth-child(2){width:12%}.print-results-panel th:nth-child(3){width:30%}.print-results-panel th:nth-child(4){width:10%}.print-results-panel th:nth-child(5){width:44%}.print-results-panel tr{break-inside:avoid!important}.print-results-panel .status-badge{font-size:7px!important;padding:2px 4px!important}.print-results-panel .subline{font-size:7.5px!important;line-height:1.2!important}
        .monitoring-result-mobile{display:none!important}.monitoring-result-desktop{display:block!important}.monitoring-photo-group{margin-top:4px!important}.monitoring-photo-title{margin-bottom:3px!important;font-size:8px!important}.monitoring-photo-list{gap:5px!important}.monitoring-photo-item{width:118px!important}.monitoring-photo-item img{width:118px!important;height:86px!important;border-radius:3px!important}.monitoring-photo-item small{font-size:7.5px!important;line-height:1.08!important;margin-top:2px!important}
        .signature-footer{padding:7px!important;margin-top:5px!important;border-radius:7px!important;break-inside:avoid!important}.signature-footer>div{grid-template-columns:1fr 1fr!important;gap:16px!important}.signature-footer strong{font-size:9px!important}.signature-caption{font-size:7.5px!important}.signature-space{min-height:34px!important}.signature-system-note{font-size:7px!important;margin-top:2px!important}
        img{print-color-adjust:exact;-webkit-print-color-adjust:exact}
      }
    `}</style>
    <PageHeader eyebrow={`ĐỢT GIÁM SÁT · ${record?.record_code || "—"}`} title={record?.title || "Đợt giám sát"} description={`${template?.name || "Bảng kiểm"} · v${version?.version_no || "—"}`} />
    <div className="monitoring-sticky-actions no-print"><MonitoringBackButton roundId={round.id} />{hasResponses ? <MonitoringPrintClient roundId={round.id} isConfirmed={isConfirmed} /> : null}</div>
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}

    <section className="panel monitoring-status-panel" style={{ padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div><div className="eyebrow">TRẠNG THÁI ĐỢT GIÁM SÁT</div><strong style={{ fontSize: 18 }}>{phaseLabel}</strong><div className="subline">Ngày dự kiến/thực hiện: {formatDate(round.scheduled_date)} · Người giám sát: {assessorName || "—"}</div></div><span className={`status-badge ${phaseTone}`}>{phaseLabel}</span></div></section>

    {scheduled ? <MonitoringStartClient roundId={round.id} canPerform={user.permissions.includes("monitoring.perform")} /> : null}

    {activeScoring && ["BK01.V1_QLCL.QĐ.06","BK02.V1_QLCL.QĐ.06","BK03.V1_QLCL.QĐ.06","BK05.V1_QLCL.QĐ.06","BK07.V1_QLCL.QĐ.06","BK09.V1_QLCL.QĐ.06"].includes(template?.code || "") ? <FiveSChecklistRunClient templateId={template.id} versionId={version.id} templateCode={template.code} sections={structure as any[]} assessorName={user.fullName} canPerform={user.permissions.includes("monitoring.perform")} roundId={round.id} initialMonitoringDate={round.scheduled_date} /> : null}
    {activeScoring && !["BK01.V1_QLCL.QĐ.06","BK02.V1_QLCL.QĐ.06","BK03.V1_QLCL.QĐ.06","BK05.V1_QLCL.QĐ.06","BK07.V1_QLCL.QĐ.06","BK09.V1_QLCL.QĐ.06"].includes(template?.code || "") ? <GenericChecklistRunClient templateId={template.id} versionId={version.id} roundId={round.id} sections={structure as any[]} assessorName={user.fullName} canPerform={user.permissions.includes("monitoring.perform")} initialMonitoringDate={round.scheduled_date} /> : null}

    {hasResponses ? <>
      <section className="kpi-grid print-kpis">
        <article className="kpi-card"><span>Ngày giám sát</span><strong style={{ fontSize: 20 }}>{formatDate(round.scheduled_date)}</strong><small>{context.staff_name ? `Nhân viên thực hiện: ${context.staff_name}` : "—"}</small></article>
        <article className="kpi-card success"><span>Đạt</span><strong>{passCount}</strong><small>{rows.length} nội dung</small></article>
        <article className="kpi-card warning"><span>Không đạt</span><strong>{failCount}</strong><small>{naCount} nội dung “/”</small></article>
        <article className="kpi-card"><span>Tỷ lệ đạt</span><strong>{compliance}%</strong><small>Đạt / (Đạt + Không đạt)</small></article>
      </section>

      <section className="panel monitoring-info-panel" style={{ padding: 18 }}><div className="form-grid two"><div><div className="eyebrow">KHU VỰC ĐÁNH GIÁ</div><strong>{round.target_area || "—"}</strong></div><div><div className="eyebrow">NGƯỜI GIÁM SÁT</div><strong>{assessorName || "—"}</strong></div></div>{confirmation ? <div className="scope-note" style={{ marginTop: 14 }}><strong>Phòng QLCL đã xác nhận:</strong> {confirmation.full_name || "Tài khoản QLCL"} · {formatHcmDateTime(confirmation.confirmed_at)}</div> : isConfirmed ? <div className="scope-note" style={{ marginTop: 14 }}><strong>Phòng QLCL đã xác nhận trên hệ thống.</strong></div> : null}</section>

      <section className="panel print-results-panel"><div className="panel-title"><div><h2>Kết quả bảng kiểm</h2><p>Kết quả ban đầu được khóa; phần khắc phục và ảnh sau được lưu riêng để truy vết.</p></div></div>
        <div className="monitoring-result-desktop table-wrap"><table><thead><tr><th>#</th><th>Tiêu chuẩn</th><th>Nội dung</th><th>Kết quả</th><th>Ghi chú / Khắc phục / Hình ảnh</th></tr></thead><tbody>
          {rows.map((row: any, index: number) => { const value = row.response?.answer_value || {}; const correction = value.correction; const initialImages = Array.isArray(value.initial_images) ? value.initial_images : []; const afterImages = Array.isArray(correction?.images_after) ? correction.images_after : []; return <tr key={row.item.id}><td>{index + 1}</td><td><strong>{row.section?.title || "—"}</strong></td><td>{row.item.content}</td><td><span className={`status-badge ${row.response?.result_status === "PASS" ? "success" : row.response?.result_status === "FAIL" ? "danger" : "muted"}`}>{RESULT_LABELS[row.response?.result_status] || row.response?.result_status}</span></td><td>{row.response?.note || "—"}{correction ? <div className="subline">Khắc phục: {correction.description || "—"} · Kiểm tra: {formatHcmDateTime(correction.rechecked_at)} · {correction.recheck_result === "PASS" ? "Đạt sau khắc phục" : correction.recheck_result === "FAIL" ? "Vẫn không đạt" : "Chưa có kết quả"}</div> : null}<PhotoList title="Ảnh ban đầu" photos={initialImages} /><PhotoList title="Ảnh sau khắc phục" photos={afterImages} /></td></tr>; })}
        </tbody></table></div>
        <div className="monitoring-result-mobile">
          {rows.map((row: any, index: number) => { const value = row.response?.answer_value || {}; const correction = value.correction; const initialImages = Array.isArray(value.initial_images) ? value.initial_images : []; const afterImages = Array.isArray(correction?.images_after) ? correction.images_after : []; return <article key={row.item.id} className={`monitoring-result-card ${row.response?.result_status === "FAIL" ? "fail" : ""}`}><div className="monitoring-result-card-head"><strong>#{index + 1} · {row.section?.title || "—"}</strong><span className={`status-badge ${row.response?.result_status === "PASS" ? "success" : row.response?.result_status === "FAIL" ? "danger" : "muted"}`}>{RESULT_LABELS[row.response?.result_status] || row.response?.result_status}</span></div><div className="monitoring-result-card-content">{row.item.content}</div>{row.response?.note ? <div className="monitoring-result-card-note"><strong>Ghi chú:</strong> {row.response.note}</div> : null}{correction ? <div className="monitoring-result-card-note"><strong>Khắc phục:</strong> {correction.description || "—"}<br /><strong>Kiểm tra lại:</strong> {formatHcmDateTime(correction.rechecked_at)} · {correction.recheck_result === "PASS" ? "Đạt sau khắc phục" : correction.recheck_result === "FAIL" ? "Vẫn không đạt" : "Chưa có kết quả"}</div> : null}<PhotoList title="Ảnh ban đầu" photos={initialImages} /><PhotoList title="Ảnh sau khắc phục" photos={afterImages} /></article>; })}
        </div>
      </section>

      <SignatureFooter assessorName={assessorName} confirmation={confirmation} isConfirmed={isConfirmed} />
    </> : null}

    {waitingRecheck ? <div className="no-print"><MonitoringRecheckClient roundId={round.id} status={round.workflow_status} canPerform={user.permissions.includes("monitoring.perform")} rows={recheckRows} area={round.target_area} /></div> : null}
    {round.workflow_status === "AWAITING_CONFIRMATION" ? <div className="no-print"><MonitoringConfirmClient roundId={round.id} status={round.workflow_status} canConfirm={user.permissions.includes("checklists.manage")} /></div> : null}
  </div>;
}
