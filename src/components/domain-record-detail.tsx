import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type FieldKind = "text" | "date" | "datetime" | "status" | "boolean" | "number";
type Field = { label: string; value: unknown; kind?: FieldKind; wide?: boolean };
type Section = { title: string; subtitle?: string; fields: Field[]; metrics?: { label: string; value: string | number }[] };

function valueText(value: unknown, kind: FieldKind = "text") {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "date") return formatDate(String(value));
  if (kind === "datetime") return formatDateTime(String(value));
  if (kind === "boolean") return value ? "Có" : "Không";
  if (kind === "number") return typeof value === "number" ? value.toLocaleString("vi-VN") : String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailField({ field }: { field: Field }) {
  return <div className={field.wide ? "domain-field wide" : "domain-field"}>
    <span>{field.label}</span>
    {field.kind === "status" && field.value ? <StatusBadge status={String(field.value)} /> : <strong>{valueText(field.value, field.kind)}</strong>}
  </div>;
}

function DetailSection({ section }: { section: Section }) {
  return <section className="panel domain-detail-panel">
    <div className="panel-title domain-detail-head"><div><h2>{section.title}</h2>{section.subtitle ? <p>{section.subtitle}</p> : null}</div></div>
    {section.metrics?.length ? <div className="domain-metrics">{section.metrics.map((m) => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div> : null}
    <div className="domain-detail-grid">{section.fields.map((field, index) => <DetailField field={field} key={`${field.label}-${index}`} />)}</div>
  </section>;
}

async function countRows(supabase: any, table: string, column: string, value: string) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

export async function DomainRecordDetail({ recordType, recordId }: { recordType: string; recordId: string }) {
  const supabase = await createClient();
  const sections: Section[] = [];

  if (recordType === "PROGRAM") {
    const { data: row } = await supabase.from("work_programs").select("id,program_type,description,objective,start_date,end_date,workflow_status,approved_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const actions = await countRows(supabase, "program_action_links", "program_id", row.id);
      sections.push({ title: "Thông tin kế hoạch", metrics: [{ label: "Action liên kết", value: actions }], fields: [
        { label: "Loại chương trình", value: row.program_type }, { label: "Trạng thái nghiệp vụ", value: row.workflow_status, kind: "status" },
        { label: "Bắt đầu", value: row.start_date, kind: "date" }, { label: "Kết thúc", value: row.end_date, kind: "date" },
        { label: "Mục tiêu", value: row.objective, wide: true }, { label: "Mô tả", value: row.description, wide: true }, { label: "Phê duyệt lúc", value: row.approved_at, kind: "datetime" }
      ]});
    }
  }

  if (recordType === "DIRECTIVE") {
    const { data: row } = await supabase.from("external_directives").select("id,source_authority,directive_type,received_date,implementation_due_date,report_due_date,summary,requirements,priority,workflow_status").eq("record_id", recordId).maybeSingle();
    if (row) {
      const actions = await countRows(supabase, "directive_action_links", "directive_id", row.id);
      sections.push({ title: "Nội dung chỉ đạo / yêu cầu", metrics: [{ label: "Action phải thực hiện", value: actions }], fields: [
        { label: "Cơ quan/nguồn", value: row.source_authority }, { label: "Loại yêu cầu", value: row.directive_type }, { label: "Ưu tiên", value: row.priority }, { label: "Trạng thái", value: row.workflow_status, kind: "status" },
        { label: "Ngày tiếp nhận", value: row.received_date, kind: "date" }, { label: "Hạn thực hiện", value: row.implementation_due_date, kind: "date" }, { label: "Hạn báo cáo", value: row.report_due_date, kind: "date" },
        { label: "Tóm tắt", value: row.summary, wide: true }, { label: "Yêu cầu phải thực hiện", value: row.requirements, wide: true }
      ]});
    }
  }

  if (recordType === "REPORT") {
    const { data: row } = await supabase.from("reporting_obligations").select("id,report_type,reporting_period,reporting_period_start,reporting_period_end,data_cutoff_date,due_date,recipient_name,submission_method,workflow_status,recurrence_rule,recurrence_end_date,notes").eq("record_id", recordId).maybeSingle();
    if (row) {
      const { data: submission } = await supabase.from("report_submissions").select("submission_version,submission_type,submitted_at,recipient,channel,official_document_number").eq("reporting_obligation_id", row.id).order("submission_version", { ascending: false }).limit(1).maybeSingle();
      const submissions = await countRows(supabase, "report_submissions", "reporting_obligation_id", row.id);
      sections.push({ title: "Nghĩa vụ báo cáo", metrics: [{ label: "Lần gửi", value: submissions }], fields: [
        { label: "Loại báo cáo", value: row.report_type }, { label: "Kỳ báo cáo", value: row.reporting_period }, { label: "Trạng thái", value: row.workflow_status, kind: "status" },
        { label: "Từ ngày", value: row.reporting_period_start, kind: "date" }, { label: "Đến ngày", value: row.reporting_period_end, kind: "date" }, { label: "Ngày chốt dữ liệu", value: row.data_cutoff_date, kind: "date" }, { label: "Hạn nộp", value: row.due_date, kind: "date" },
        { label: "Nơi nhận", value: row.recipient_name }, { label: "Phương thức gửi", value: row.submission_method }, { label: "Lặp lại", value: row.recurrence_rule }, { label: "Kết thúc lặp", value: row.recurrence_end_date, kind: "date" }, { label: "Ghi chú", value: row.notes, wide: true }
      ]});
      if (submission) sections.push({ title: "Lần gửi gần nhất", fields: [
        { label: "Phiên bản", value: submission.submission_version, kind: "number" }, { label: "Loại gửi", value: submission.submission_type }, { label: "Thời điểm gửi", value: submission.submitted_at, kind: "datetime" },
        { label: "Nơi nhận", value: submission.recipient }, { label: "Kênh gửi", value: submission.channel }, { label: "Số văn bản", value: submission.official_document_number }
      ]});
    }
  }

  if (recordType === "INSPECTION") {
    const { data: row } = await supabase.from("inspection_events").select("id,inspection_type,authority,visit_date,workflow_status").eq("record_id", recordId).maybeSingle();
    if (row) {
      const actions = await countRows(supabase, "inspection_action_links", "inspection_event_id", row.id);
      sections.push({ title: "Inspection Mode", subtitle: "Đếm ngược chuẩn bị và theo dõi sau đoàn từ cùng hồ sơ nguồn.", metrics: [{ label: "Action countdown", value: actions }], fields: [
        { label: "Loại kiểm tra", value: row.inspection_type }, { label: "Cơ quan/đoàn", value: row.authority }, { label: "Ngày đoàn đến", value: row.visit_date, kind: "date" }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }
      ]});
    }
  }

  if (recordType === "INDICATOR_MEASUREMENT") {
    const { data: row } = await supabase.from("indicator_measurements").select("id,indicator_assignment_id,period_start,period_end,numerator_value,denominator_value,raw_value,calculated_value,result_level,source_mode,workflow_status,submitted_at,verified_at,locked_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const { data: assignment } = await supabase.from("indicator_assignments").select("indicator_version_id,local_target,frequency,status").eq("id", row.indicator_assignment_id).maybeSingle();
      let definition: any = null; let version: any = null;
      if (assignment?.indicator_version_id) {
        const versionResult = await supabase.from("indicator_definition_versions").select("indicator_definition_id,version_no,calculation_type,multiplier,unit,desired_direction,frequency,status").eq("id", assignment.indicator_version_id).maybeSingle();
        version = versionResult.data;
        if (version?.indicator_definition_id) definition = (await supabase.from("indicator_definitions").select("code,name,quality_dimension,purpose").eq("id", version.indicator_definition_id).maybeSingle()).data;
      }
      sections.push({ title: "Kỳ đo chỉ số", metrics: [{ label: "Kết quả", value: row.calculated_value ?? row.raw_value ?? "—" }, { label: "Mục tiêu", value: assignment?.local_target ?? "—" }], fields: [
        { label: "Chỉ số", value: definition ? `${definition.code || ""} ${definition.name}`.trim() : "—", wide: true }, { label: "Chiều chất lượng", value: definition?.quality_dimension }, { label: "Đơn vị", value: version?.unit },
        { label: "Kỳ từ", value: row.period_start, kind: "date" }, { label: "Kỳ đến", value: row.period_end, kind: "date" }, { label: "Tần suất", value: assignment?.frequency || version?.frequency },
        { label: "Tử số", value: row.numerator_value, kind: "number" }, { label: "Mẫu số", value: row.denominator_value, kind: "number" }, { label: "Giá trị thô", value: row.raw_value, kind: "number" }, { label: "Giá trị tính", value: row.calculated_value, kind: "number" },
        { label: "Mức kết quả", value: row.result_level, kind: "status" }, { label: "Nguồn dữ liệu", value: row.source_mode }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Đã xác minh", value: row.verified_at, kind: "datetime" }, { label: "Đã khóa", value: row.locked_at, kind: "datetime" },
        { label: "Mục đích", value: definition?.purpose, wide: true }
      ]});
    }
  }

  if (recordType === "FINDING") {
    const { data: row } = await supabase.from("findings").select("id,finding_type,description,severity,identified_at,due_date,immediate_action,workflow_status,confirmed_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const actions = await countRows(supabase, "finding_action_links", "finding_id", row.id);
      const { data: verification } = await supabase.from("finding_verifications").select("verification_no,reviewed_at,result,comment,next_due_date").eq("finding_id", row.id).order("verification_no", { ascending: false }).limit(1).maybeSingle();
      sections.push({ title: "Finding", metrics: [{ label: "Action liên kết", value: actions }, { label: "Lần recheck", value: verification?.verification_no ?? 0 }], fields: [
        { label: "Loại phát hiện", value: row.finding_type }, { label: "Mức độ", value: row.severity, kind: "status" }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Ngày phát hiện", value: row.identified_at, kind: "datetime" }, { label: "Hạn khắc phục", value: row.due_date, kind: "date" },
        { label: "Mô tả phát hiện", value: row.description, wide: true }, { label: "Khắc phục tức thời", value: row.immediate_action, wide: true }, { label: "Xác nhận lúc", value: row.confirmed_at, kind: "datetime" }
      ]});
      if (verification) sections.push({ title: "Recheck gần nhất", fields: [
        { label: "Lần", value: verification.verification_no, kind: "number" }, { label: "Kết quả", value: verification.result, kind: "status" }, { label: "Ngày kiểm tra lại", value: verification.reviewed_at, kind: "datetime" }, { label: "Hạn tiếp theo", value: verification.next_due_date, kind: "date" }, { label: "Nhận xét", value: verification.comment, wide: true }
      ]});
    }
  }

  if (recordType === "INCIDENT") {
    const { data: row, error } = await supabase.from("incidents").select("id,occurred_at,detected_at,reported_at,incident_location_text,summary,verified_description,harm_status,serious_event_flag,workflow_status,investigation_required,rca_required,closed_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const [actions, investigations] = await Promise.all([countRows(supabase, "incident_initial_actions", "incident_id", row.id), countRows(supabase, "incident_investigations", "incident_id", row.id)]);
      const { data: investigation } = await supabase.from("incident_investigations").select("investigation_type,started_at,completed_at,verified_event_summary,harm_conclusion,rca_required,conclusion,status").eq("incident_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      sections.push({ title: "Hồ sơ sự cố", subtitle: "Chỉ hiển thị thông tin mà tài khoản hiện tại được RLS cho phép truy cập.", metrics: [{ label: "Xử trí ban đầu", value: actions }, { label: "Điều tra", value: investigations }], fields: [
        { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Mức tổn hại", value: row.harm_status, kind: "status" }, { label: "Sự cố nghiêm trọng", value: row.serious_event_flag, kind: "boolean" }, { label: "Cần điều tra", value: row.investigation_required, kind: "boolean" }, { label: "Cần RCA", value: row.rca_required, kind: "boolean" },
        { label: "Xảy ra", value: row.occurred_at, kind: "datetime" }, { label: "Phát hiện", value: row.detected_at, kind: "datetime" }, { label: "Báo cáo", value: row.reported_at, kind: "datetime" }, { label: "Vị trí", value: row.incident_location_text },
        { label: "Tóm tắt", value: row.summary, wide: true }, { label: "Mô tả đã xác minh", value: row.verified_description, wide: true }, { label: "Đóng lúc", value: row.closed_at, kind: "datetime" }
      ]});
      if (investigation) sections.push({ title: "Điều tra gần nhất", fields: [
        { label: "Loại điều tra", value: investigation.investigation_type }, { label: "Trạng thái", value: investigation.status, kind: "status" }, { label: "Bắt đầu", value: investigation.started_at, kind: "datetime" }, { label: "Hoàn tất", value: investigation.completed_at, kind: "datetime" }, { label: "RCA bắt buộc", value: investigation.rca_required, kind: "boolean" },
        { label: "Sự kiện đã xác minh", value: investigation.verified_event_summary, wide: true }, { label: "Kết luận tổn hại", value: investigation.harm_conclusion, wide: true }, { label: "Kết luận điều tra", value: investigation.conclusion, wide: true }
      ]});
    } else if (error) sections.push({ title: "Hồ sơ sự cố", subtitle: "Thông tin chi tiết được bảo vệ bởi quyền truy cập sự cố.", fields: [{ label: "Trạng thái truy cập", value: "Không có quyền xem dữ liệu ca hoặc dữ liệu chưa tồn tại" }] });
  }

  if (recordType === "CAPA") {
    const { data: row } = await supabase.from("capas").select("id,problem_statement,priority,immediate_correction,rca_analysis_id,workflow_status,approval_required,approved_at,effectiveness_due_date,closed_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const actions = await countRows(supabase, "capa_action_links", "capa_id", row.id);
      const reviews = await countRows(supabase, "capa_effectiveness_reviews", "capa_id", row.id);
      const { data: review } = await supabase.from("capa_effectiveness_reviews").select("review_no,planned_review_date,actual_review_date,evaluation_method,target_description,actual_result,result,comment").eq("capa_id", row.id).order("review_no", { ascending: false }).limit(1).maybeSingle();
      let rca: any = null;if (row.rca_analysis_id) rca = (await supabase.from("rca_analyses").select("method,status,started_at,completed_at,conclusion").eq("id", row.rca_analysis_id).maybeSingle()).data;
      sections.push({ title: "CAPA", metrics: [{ label: "Action CAPA", value: actions }, { label: "Đánh giá hiệu lực", value: reviews }], fields: [
        { label: "Ưu tiên", value: row.priority }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Cần phê duyệt", value: row.approval_required, kind: "boolean" }, { label: "Phê duyệt lúc", value: row.approved_at, kind: "datetime" }, { label: "Hạn kiểm tra hiệu lực", value: row.effectiveness_due_date, kind: "date" },
        { label: "Vấn đề", value: row.problem_statement, wide: true }, { label: "Khắc phục tức thời", value: row.immediate_correction, wide: true }, { label: "Đóng lúc", value: row.closed_at, kind: "datetime" }
      ]});
      if (rca) sections.push({ title: "Phân tích nguyên nhân gốc", fields: [{ label: "Phương pháp", value: rca.method }, { label: "Trạng thái", value: rca.status, kind: "status" }, { label: "Bắt đầu", value: rca.started_at, kind: "datetime" }, { label: "Hoàn tất", value: rca.completed_at, kind: "datetime" }, { label: "Kết luận", value: rca.conclusion, wide: true }] });
      if (review) sections.push({ title: "Đánh giá hiệu lực gần nhất", fields: [{ label: "Lần", value: review.review_no, kind: "number" }, { label: "Kết quả", value: review.result, kind: "status" }, { label: "Ngày dự kiến", value: review.planned_review_date, kind: "date" }, { label: "Ngày thực tế", value: review.actual_review_date, kind: "date" }, { label: "Phương pháp", value: review.evaluation_method }, { label: "Mục tiêu", value: review.target_description, wide: true }, { label: "Kết quả thực tế", value: review.actual_result, wide: true }, { label: "Nhận xét", value: review.comment, wide: true }] });
    }
  }

  if (recordType === "RISK") {
    const { data: row } = await supabase.from("risks").select("id,identified_at,risk_event,cause_summary,potential_consequence,process_name,workflow_status,next_review_date,review_frequency,retired_at,retired_reason").eq("record_id", recordId).maybeSingle();
    if (row) {
      const [controls, actions] = await Promise.all([countRows(supabase, "risk_controls", "risk_id", row.id), countRows(supabase, "risk_action_links", "risk_id", row.id)]);
      const { data: assessment } = await supabase.from("risk_assessments").select("assessment_date,assessment_type,severity,likelihood,calculated_score,calculated_level,rationale,evidence_summary").eq("risk_id", row.id).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
      sections.push({ title: "Risk Register", metrics: [{ label: "Kiểm soát", value: controls }, { label: "Action xử lý", value: actions }, { label: "Risk score hiện tại", value: assessment?.calculated_score ?? "—" }], fields: [
        { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Ngày nhận diện", value: row.identified_at, kind: "datetime" }, { label: "Quy trình", value: row.process_name }, { label: "Rà soát tiếp", value: row.next_review_date, kind: "date" }, { label: "Tần suất rà soát", value: row.review_frequency },
        { label: "Sự kiện rủi ro", value: row.risk_event, wide: true }, { label: "Nguyên nhân", value: row.cause_summary, wide: true }, { label: "Hậu quả tiềm tàng", value: row.potential_consequence, wide: true }, { label: "Lý do retire", value: row.retired_reason, wide: true }
      ]});
      if (assessment) sections.push({ title: "Đánh giá rủi ro gần nhất", fields: [
        { label: "Loại đánh giá", value: assessment.assessment_type }, { label: "Ngày", value: assessment.assessment_date, kind: "date" }, { label: "Severity", value: assessment.severity, kind: "number" }, { label: "Likelihood", value: assessment.likelihood, kind: "number" }, { label: "Điểm", value: assessment.calculated_score, kind: "number" }, { label: "Mức", value: assessment.calculated_level, kind: "status" }, { label: "Lý do", value: assessment.rationale, wide: true }, { label: "Tóm tắt minh chứng", value: assessment.evidence_summary, wide: true }
      ]});
    }
  }

  if (recordType === "FMEA") {
    const { data: row } = await supabase.from("fmea_studies").select("id,method,title,process_name,scope,start_date,target_completion_date,workflow_status,approved_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const { data: steps } = await supabase.from("fmea_process_steps").select("id").eq("fmea_study_id", row.id);
      const stepIds = (steps ?? []).map((s: any) => s.id); let failureCount = 0; let highPriority = 0;
      if (stepIds.length) { const { data: modes, count } = await supabase.from("fmea_failure_modes").select("id,is_high_priority", { count: "exact" }).in("process_step_id", stepIds); failureCount = count ?? modes?.length ?? 0; highPriority = (modes ?? []).filter((m: any) => m.is_high_priority).length; }
      sections.push({ title: "FMEA / HFMEA", metrics: [{ label: "Bước quy trình", value: stepIds.length }, { label: "Failure mode", value: failureCount }, { label: "Ưu tiên cao", value: highPriority }], fields: [
        { label: "Phương pháp", value: row.method }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Quy trình", value: row.process_name }, { label: "Bắt đầu", value: row.start_date, kind: "date" }, { label: "Hạn hoàn thành", value: row.target_completion_date, kind: "date" }, { label: "Phê duyệt", value: row.approved_at, kind: "datetime" }, { label: "Phạm vi", value: row.scope, wide: true }
      ]});
    }
  }

  if (recordType === "IMPROVEMENT_PROPOSAL") {
    const { data: row } = await supabase.from("improvement_proposals").select("problem_description,reason_for_improvement,source_type,existing_data_summary,proposed_scope,workflow_status,submitted_at,reviewed_at").eq("record_id", recordId).maybeSingle();
    if (row) sections.push({ title: "Đề xuất cải tiến", fields: [
      { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Nguồn vấn đề", value: row.source_type }, { label: "Đã gửi", value: row.submitted_at, kind: "datetime" }, { label: "Đã thẩm định", value: row.reviewed_at, kind: "datetime" },
      { label: "Vấn đề", value: row.problem_description, wide: true }, { label: "Lý do cải tiến", value: row.reason_for_improvement, wide: true }, { label: "Dữ liệu nền", value: row.existing_data_summary, wide: true }, { label: "Phạm vi đề xuất", value: row.proposed_scope, wide: true }
    ]});
  }

  if (recordType === "IMPROVEMENT_PROJECT") {
    const { data: row } = await supabase.from("improvement_projects").select("id,problem_statement,start_date,target_end_date,scope_description,workflow_status,approved_at,actual_end_date").eq("record_id", recordId).maybeSingle();
    if (row) {
      const [objectives, milestones] = await Promise.all([countRows(supabase, "project_objectives", "project_id", row.id), countRows(supabase, "project_milestones", "project_id", row.id)]);
      const { data: closure } = await supabase.from("project_closure_reviews").select("reviewed_at,objective_achievement_summary,overall_result,sustainability_required,scaleout_recommended,comment").eq("project_id", row.id).order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
      sections.push({ title: "Đề án cải tiến", metrics: [{ label: "Mục tiêu SMART", value: objectives }, { label: "Milestone", value: milestones }], fields: [
        { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Bắt đầu", value: row.start_date, kind: "date" }, { label: "Hạn mục tiêu", value: row.target_end_date, kind: "date" }, { label: "Kết thúc thực tế", value: row.actual_end_date, kind: "date" }, { label: "Phê duyệt", value: row.approved_at, kind: "datetime" }, { label: "Vấn đề", value: row.problem_statement, wide: true }, { label: "Phạm vi", value: row.scope_description, wide: true }
      ]});
      if (closure) sections.push({ title: "Đánh giá kết thúc / duy trì", fields: [{ label: "Kết quả", value: closure.overall_result, kind: "status" }, { label: "Ngày review", value: closure.reviewed_at, kind: "datetime" }, { label: "Cần kế hoạch duy trì", value: closure.sustainability_required, kind: "boolean" }, { label: "Đề xuất nhân rộng", value: closure.scaleout_recommended, kind: "boolean" }, { label: "Mức đạt mục tiêu", value: closure.objective_achievement_summary, wide: true }, { label: "Nhận xét", value: closure.comment, wide: true }] });
    }
  }

  if (recordType === "ASSESSMENT") {
    const { data: row } = await supabase.from("assessment_rounds").select("id,round_type,start_date,submission_deadline,review_deadline,finalization_date,workflow_status").eq("record_id", recordId).maybeSingle();
    if (row) {
      const criteria = await countRows(supabase, "assessment_round_criteria", "assessment_round_id", row.id);
      const { data: assessments } = await supabase.from("criterion_assessments").select("workflow_status").eq("assessment_round_id", row.id);
      const completed = (assessments ?? []).filter((a: any) => ["FINALIZED","COMPLETED","APPROVED"].includes(a.workflow_status)).length;
      sections.push({ title: "Đợt tự đánh giá", metrics: [{ label: "Tiêu chí trong phạm vi", value: criteria }, { label: "Phiếu đánh giá", value: assessments?.length ?? 0 }, { label: "Đã chốt", value: completed }], fields: [
        { label: "Loại đợt", value: row.round_type }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Bắt đầu", value: row.start_date, kind: "date" }, { label: "Hạn đơn vị nộp", value: row.submission_deadline, kind: "date" }, { label: "Hạn rà soát", value: row.review_deadline, kind: "date" }, { label: "Ngày chốt", value: row.finalization_date, kind: "date" }
      ]});
    }
  }

  if (recordType === "EXTERNAL_ASSESSMENT") {
    const { data: row } = await supabase.from("external_assessment_events").select("authority,assessment_date,criteria_version_id,notes").eq("record_id", recordId).maybeSingle();
    if (row) sections.push({ title: "Đánh giá ngoài", subtitle: "Kết quả đánh giá ngoài được lưu độc lập, không ghi đè điểm tự đánh giá.", fields: [
      { label: "Cơ quan/đoàn đánh giá", value: row.authority }, { label: "Ngày đánh giá", value: row.assessment_date, kind: "date" }, { label: "Phiên bản bộ tiêu chí", value: row.criteria_version_id }, { label: "Ghi chú", value: row.notes, wide: true }
    ]});
  }

  if (recordType === "AUDIT") {
    const { data: row } = await supabase.from("audits").select("id,audit_type,objective,start_date,end_date,workflow_status,report_finalized_at,closed_at").eq("record_id", recordId).maybeSingle();
    if (row) {
      const [scopes, sessions, findings] = await Promise.all([countRows(supabase, "audit_scopes", "audit_id", row.id), countRows(supabase, "audit_sessions", "audit_id", row.id), countRows(supabase, "audit_finding_links", "audit_id", row.id)]);
      sections.push({ title: "Audit / Tracer", metrics: [{ label: "Phạm vi", value: scopes }, { label: "Phiên đánh giá", value: sessions }, { label: "Finding", value: findings }], fields: [
        { label: "Loại audit", value: row.audit_type }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Bắt đầu", value: row.start_date, kind: "date" }, { label: "Kết thúc", value: row.end_date, kind: "date" }, { label: "Báo cáo final", value: row.report_finalized_at, kind: "datetime" }, { label: "Đóng", value: row.closed_at, kind: "datetime" }, { label: "Mục tiêu", value: row.objective, wide: true }
      ]});
    }
  }

  if (recordType === "SAFETY_ALERT") {
    const { data: row } = await supabase.from("safety_alerts").select("title,summary,lesson,recommendation,published_at,expires_at,status").eq("record_id", recordId).maybeSingle();
    if (row) sections.push({ title: "Bài học / Cảnh báo", fields: [
      { label: "Trạng thái", value: row.status, kind: "status" }, { label: "Phát hành", value: row.published_at, kind: "datetime" }, { label: "Hết hiệu lực", value: row.expires_at, kind: "datetime" }, { label: "Tóm tắt", value: row.summary, wide: true }, { label: "Bài học", value: row.lesson, wide: true }, { label: "Khuyến nghị", value: row.recommendation, wide: true }
    ]});
  }

  if (recordType === "FEEDBACK") {
    const { data: row } = await supabase.from("feedback_records").select("feedback_type,received_at,source_channel,subject,description,response_due_at,workflow_status,closed_at").eq("record_id", recordId).maybeSingle();
    if (row) sections.push({ title: "Phản ánh / Góp ý", fields: [
      { label: "Loại", value: row.feedback_type }, { label: "Kênh tiếp nhận", value: row.source_channel }, { label: "Trạng thái", value: row.workflow_status, kind: "status" }, { label: "Tiếp nhận", value: row.received_at, kind: "datetime" }, { label: "Hạn phản hồi", value: row.response_due_at, kind: "datetime" }, { label: "Đóng", value: row.closed_at, kind: "datetime" }, { label: "Chủ đề", value: row.subject, wide: true }, { label: "Nội dung", value: row.description, wide: true }
    ]});
  }

  if (!sections.length) return null;
  return <div className="domain-detail-stack">{sections.map((section, index) => <DetailSection section={section} key={`${section.title}-${index}`} />)}</div>;
}
