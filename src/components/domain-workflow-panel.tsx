import { AssessmentWorkflowClient } from "@/components/assessment-workflow-client";
import { AssessmentCriteriaClient } from "@/components/assessment-criteria-client";
import { AuditWorkflowClient } from "@/components/audit-workflow-client";
import { CapaWorkflowClient } from "@/components/capa-workflow-client";
import { DirectiveWorkflowClient } from "@/components/directive-workflow-client";
import { FindingWorkflowClient } from "@/components/finding-workflow-client";
import { FmeaWorkflowClient } from "@/components/fmea-workflow-client";
import { ExternalAssessmentWorkflowClient } from "@/components/external-assessment-workflow-client";
import { FeedbackWorkflowClient } from "@/components/feedback-workflow-client";
import { IncidentWorkflowClient } from "@/components/incident-workflow-client";
import { ImprovementProjectWorkflowClient } from "@/components/improvement-project-workflow-client";
import { ImprovementProposalWorkflowClient } from "@/components/improvement-proposal-workflow-client";
import { InspectionWorkflowClient } from "@/components/inspection-workflow-client";
import { IndicatorWorkflowClient } from "@/components/indicator-workflow-client";
import { RiskWorkflowClient } from "@/components/risk-workflow-client";
import { ReportWorkflowClient } from "@/components/report-workflow-client";
import { SafetyAlertWorkflowClient } from "@/components/safety-alert-workflow-client";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function todayHcm() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export async function DomainWorkflowPanel({ recordId, recordType }: { recordId: string; recordType: string }) {
  const { user } = await requireUserContext();
  const supabase = await createClient();

  if (recordType === "DIRECTIVE") {
    const {data:d}=await supabase.from("external_directives").select("id,workflow_status,requirements,lead_department_id,owner_user_id").eq("record_id",recordId).maybeSingle();if(!d)return null;const[{data:links},{count:evidence}]=await Promise.all([supabase.from("directive_action_links").select("action_id").eq("directive_id",d.id),supabase.from("evidence_links").select("id",{count:"exact",head:true}).eq("record_id",recordId)]);const ids=(links??[]).map((x:any)=>x.action_id).filter(Boolean);const{data:actions}=ids.length?await supabase.from("actions").select("workflow_status").in("id",ids):{data:[] as any[]};const active=(actions??[]).filter((x:any)=>!["CANCELLED","NOT_APPLICABLE"].includes(String(x.workflow_status)));return <DirectiveWorkflowClient recordId={recordId} status={d.workflow_status} canManage={user.permissions.includes("directives.manage")} hasOwner={!!d.lead_department_id&&!!d.owner_user_id} hasRequirements={!!String(d.requirements||"").trim()} actions={active.length} incomplete={active.filter((x:any)=>x.workflow_status!=="COMPLETED").length} evidence={evidence??0}/>;
  }

  if (recordType === "REPORT") {
    const {data:report}=await supabase.from("reporting_obligations").select("id,workflow_status,due_date,recipient_name,preparing_department_id,preparer_user_id").eq("record_id",recordId).maybeSingle();if(!report)return null;const[{data:links},{count:evidence},{count:submissions}]=await Promise.all([supabase.from("record_links").select("target_record_id").eq("source_record_id",recordId).eq("relation_type","HAS_ACTION"),supabase.from("evidence_links").select("id",{count:"exact",head:true}).eq("record_id",recordId),supabase.from("report_submissions").select("id",{count:"exact",head:true}).eq("reporting_obligation_id",report.id)]);const ids=(links??[]).map((x:any)=>x.target_record_id).filter(Boolean);const{data:actions}=ids.length?await supabase.from("actions").select("workflow_status").in("record_id",ids):{data:[] as any[]};const active=(actions??[]).filter((x:any)=>!["CANCELLED","NOT_APPLICABLE"].includes(String(x.workflow_status)));return <ReportWorkflowClient recordId={recordId} status={report.workflow_status} canManage={user.permissions.includes("reports.manage")} ready={!!report.due_date&&!!report.recipient_name&&!!report.preparing_department_id&&!!report.preparer_user_id} actions={active.length} incomplete={active.filter((x:any)=>x.workflow_status!=="COMPLETED").length} evidence={evidence??0} submissions={submissions??0}/>;
  }

  if (recordType === "FEEDBACK") {
    const { data: feedback } = await supabase.from("feedback_records").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!feedback) return null;
    const [{ count: evidence }, { data: link }] = await Promise.all([supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId), supabase.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "GENERATED_FINDING").maybeSingle()]);
    let finding: { href: string; status: string } | null = null;
    if (link?.target_record_id) { const { data } = await supabase.from("findings").select("workflow_status").eq("record_id", link.target_record_id).maybeSingle(); finding = { href: `/findings/${link.target_record_id}`, status: String(data?.workflow_status || "OPEN") }; }
    return <FeedbackWorkflowClient recordId={recordId} status={feedback.workflow_status} canManage={user.permissions.includes("feedback.manage")} evidence={evidence ?? 0} finding={finding} />;
  }

  if (recordType === "SAFETY_ALERT") {
    const { data: alert } = await supabase.from("safety_alerts").select("status,summary,lesson,recommendation,expires_at").eq("record_id", recordId).maybeSingle();
    if (!alert) return null;
    const { count: evidence } = await supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    return <SafetyAlertWorkflowClient recordId={recordId} status={alert.status} canInvestigate={user.permissions.includes("incident.investigate") || user.permissions.includes("incident.close")} canApprove={user.permissions.includes("incident.close")} contentReady={!!String(alert.summary || "").trim() && !!String(alert.lesson || "").trim() && !!String(alert.recommendation || "").trim()} evidence={evidence ?? 0} expiresAt={alert.expires_at} />;
  }

  if (recordType === "EXTERNAL_ASSESSMENT") {
    const { data: event } = await supabase.from("external_assessment_events").select("id,criteria_version_id").eq("record_id", recordId).maybeSingle();
    const { data: record } = await supabase.from("records").select("lifecycle_status").eq("id", recordId).maybeSingle();
    if (!event || !record) return null;
    const [{ data: links }, { count: evidence }, { data: rounds }] = await Promise.all([
      supabase.from("record_links").select("id,target_record_id,relation_type,metadata").eq("source_record_id", recordId).in("relation_type", ["COMPARED_WITH_SELF", "GENERATED_FINDING"]),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
      supabase.from("assessment_rounds").select("record_id,workflow_status,criteria_version_id").eq("criteria_version_id", event.criteria_version_id).eq("workflow_status", "FINALIZED"),
    ]);
    const selfIds = (rounds ?? []).map((x: any) => x.record_id).filter(Boolean);
    const findingLinks = (links ?? []).filter((x: any) => x.relation_type === "GENERATED_FINDING");
    const findingRecordIds = findingLinks.map((x: any) => x.target_record_id).filter(Boolean);
    const allIds = Array.from(new Set([...selfIds, ...findingRecordIds]));
    const { data: linkedRecords } = allIds.length ? await supabase.from("records").select("id,record_code,title,record_type").in("id", allIds) : { data: [] as any[] };
    const recordMap = new Map((linkedRecords ?? []).map((x: any) => [x.id, x]));
    const { data: findings } = findingRecordIds.length ? await supabase.from("findings").select("record_id,workflow_status").in("record_id", findingRecordIds) : { data: [] as any[] };
    const findingMap = new Map((findings ?? []).map((x: any) => [x.record_id, x.workflow_status]));
    const comparison = (links ?? []).find((x: any) => x.relation_type === "COMPARED_WITH_SELF");
    const linkedSelfRecord: any = comparison ? recordMap.get(comparison.target_record_id) : null;
    const canManage = user.permissions.includes("criteria.manage");
    return <ExternalAssessmentWorkflowClient recordId={recordId} lifecycleStatus={record.lifecycle_status} canManage={canManage} canReview={canManage || user.permissions.includes("criteria.review")} selfOptions={selfIds.map((id: string) => { const x: any = recordMap.get(id); return { id, label: x ? `${x.record_code} · ${x.title}` : id }; })} linkedSelf={linkedSelfRecord ? { id: linkedSelfRecord.id, label: `${linkedSelfRecord.record_code} · ${linkedSelfRecord.title}` } : null} gaps={findingLinks.map((x: any) => ({ id: x.id, criterionRef: String(x.metadata?.criterion_ref || "—"), selfScore: String(x.metadata?.self_score || "—"), externalScore: String(x.metadata?.external_score || "—"), status: String(findingMap.get(x.target_record_id) || "OPEN"), href: `/findings/${x.target_record_id}` }))} evidence={evidence ?? 0} />;
  }

  if (recordType === "ASSESSMENT") {
    const { data: round } = await supabase.from("assessment_rounds").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!round) return null;
    const [{ count: scope }, { data: assessments }, { count: evidence }] = await Promise.all([
      supabase.from("assessment_round_criteria").select("id", { count: "exact", head: true }).eq("assessment_round_id", round.id),
      supabase.from("criterion_assessments").select("workflow_status").eq("assessment_round_id", round.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    ]);
    const submitted = (assessments ?? []).filter((x: any) => ["SUBMITTED", "REVIEWED", "FINALIZED", "COMPLETED", "APPROVED"].includes(String(x.workflow_status))).length;
    const canManage = user.permissions.includes("criteria.manage");
    const { data: scopeRows } = await supabase.from("assessment_round_criteria").select("criterion_id,is_required").eq("assessment_round_id", round.id);
    const criterionIds = (scopeRows ?? []).map((x: any) => x.criterion_id).filter(Boolean);
    const [{ data: criterionRows }, { data: levelRows }, { data: assessmentRows }] = criterionIds.length ? await Promise.all([
      supabase.from("criteria_items").select("id,criterion_code,criterion_name,sequence_no").in("id", criterionIds).order("sequence_no"),
      supabase.from("criterion_levels").select("id,criterion_id,level_code,level_value,level_name,sequence_no").in("criterion_id", criterionIds).order("sequence_no"),
      supabase.from("criterion_assessments").select("criterion_id,proposed_level_id,summary_comment,workflow_status,self_assessor_user_id").eq("assessment_round_id", round.id),
    ]) : [{ data: [] }, { data: [] }, { data: [] }] as any;
    const ownAssessments = new Map((assessmentRows ?? []).filter((x: any) => x.self_assessor_user_id === user.id).map((x: any) => [x.criterion_id, x]));
    const scopeMap = new Map((scopeRows ?? []).map((x: any) => [x.criterion_id, x.is_required !== false]));
    const criteria = (criterionRows ?? []).map((criterion: any) => { const saved: any = ownAssessments.get(criterion.id); return { id: criterion.id, code: criterion.criterion_code, name: criterion.criterion_name, required: scopeMap.get(criterion.id) !== false, levels: (levelRows ?? []).filter((level: any) => level.criterion_id === criterion.id).map((level: any) => ({ id: level.id, label: `${level.level_code}${level.level_name ? ` · ${level.level_name}` : ""}${level.level_value == null ? "" : ` (${level.level_value} điểm)`}` })), levelId: saved?.proposed_level_id || "", comment: saved?.summary_comment || "", status: saved?.workflow_status || "NOT_STARTED" }; });
    const canAssess = user.permissions.includes("criteria.assess") || canManage;
    return <><AssessmentWorkflowClient recordId={recordId} status={round.workflow_status} canManage={canManage} canReview={canManage || user.permissions.includes("criteria.review")} scope={scope ?? 0} submitted={submitted} evidence={evidence ?? 0} /><AssessmentCriteriaClient recordId={recordId} editable={round.workflow_status === "IN_PROGRESS" && canAssess} criteria={criteria} /></>;
  }

  if (recordType === "AUDIT") {
    const { data: audit } = await supabase.from("audits").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!audit) return null;
    const [{ count: scopes }, { count: sessions }, { data: links }, { count: evidence }] = await Promise.all([
      supabase.from("audit_scopes").select("id", { count: "exact", head: true }).eq("audit_id", audit.id),
      supabase.from("audit_sessions").select("id", { count: "exact", head: true }).eq("audit_id", audit.id),
      supabase.from("audit_finding_links").select("finding_id").eq("audit_id", audit.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    ]);
    const findingIds = (links ?? []).map((x: any) => x.finding_id).filter(Boolean);
    const { data: findings } = findingIds.length ? await supabase.from("findings").select("id,workflow_status").in("id", findingIds) : { data: [] as any[] };
    const openFindings = (findings ?? []).filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status))).length;
    return <AuditWorkflowClient recordId={recordId} status={audit.workflow_status} canManage={user.permissions.includes("audit.manage")} scopes={scopes ?? 0} sessions={sessions ?? 0} findings={findingIds.length} openFindings={openFindings} evidence={evidence ?? 0} />;
  }

  if (recordType === "FMEA") {
    const {data:study}=await supabase.from("fmea_studies").select("id,workflow_status,scoring_model_version_id").eq("record_id",recordId).maybeSingle();if(!study)return null;const[{data:steps},{data:links},{count:evidence}]=await Promise.all([supabase.from("fmea_process_steps").select("id").eq("fmea_study_id",study.id),supabase.from("record_links").select("target_record_id").eq("source_record_id",recordId).eq("relation_type","HAS_ACTION"),supabase.from("evidence_links").select("id",{count:"exact",head:true}).eq("record_id",recordId)]);const stepIds=(steps??[]).map((x:any)=>x.id);const{data:modes}=stepIds.length?await supabase.from("fmea_failure_modes").select("id,is_high_priority").in("process_step_id",stepIds):{data:[] as any[]};const ids=(links??[]).map((x:any)=>x.target_record_id).filter(Boolean);const{data:actions}=ids.length?await supabase.from("actions").select("record_id,workflow_status").in("record_id",ids):{data:[] as any[]};const active=(actions??[]).filter((x:any)=>!["CANCELLED","NOT_APPLICABLE"].includes(String(x.workflow_status)));return <FmeaWorkflowClient recordId={recordId} status={study.workflow_status} canManage={user.permissions.includes("risk.manage")} hasModel={!!study.scoring_model_version_id} steps={stepIds.length} modes={(modes??[]).length} highPriority={(modes??[]).filter((x:any)=>x.is_high_priority).length} actions={active.length} incomplete={active.filter((x:any)=>x.workflow_status!=="COMPLETED").length} evidence={evidence??0}/>;
  }

  if (recordType === "IMPROVEMENT_PROJECT") {
    const { data: project } = await supabase.from("improvement_projects").select("id,workflow_status").eq("record_id", recordId).maybeSingle(); if (!project) return null;
    const [{ count: objectives }, { count: milestones }, { data: links }, { count: evidence }] = await Promise.all([supabase.from("project_objectives").select("id",{count:"exact",head:true}).eq("project_id",project.id),supabase.from("project_milestones").select("id",{count:"exact",head:true}).eq("project_id",project.id),supabase.from("record_links").select("target_record_id").eq("source_record_id",recordId).eq("relation_type","HAS_ACTION"),supabase.from("evidence_links").select("id",{count:"exact",head:true}).eq("record_id",recordId)]);
    const ids=(links??[]).map((x:any)=>x.target_record_id).filter(Boolean);const {data:actions}=ids.length?await supabase.from("actions").select("record_id,workflow_status").in("record_id",ids):{data:[] as any[]};const active=(actions??[]).filter((x:any)=>!["CANCELLED","NOT_APPLICABLE"].includes(String(x.workflow_status)));const incomplete=active.filter((x:any)=>x.workflow_status!=="COMPLETED").length;
    return <ImprovementProjectWorkflowClient recordId={recordId} status={project.workflow_status} canManage={user.permissions.includes("projects.manage")} objectives={objectives??0} milestones={milestones??0} actions={active.length} incomplete={incomplete} evidence={evidence??0}/>;
  }

  if (recordType === "IMPROVEMENT_PROPOSAL") {
    const { data: proposal } = await supabase.from("improvement_proposals").select("id,problem_description,existing_data_summary,proposed_scope,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!proposal) return null;
    const { data: projectLink } = await supabase.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "CONVERTED_TO_PROJECT").maybeSingle();
    const canManage = user.permissions.includes("projects.manage");
    return <ImprovementProposalWorkflowClient recordId={recordId} status={proposal.workflow_status} canSubmit={canManage || user.permissions.includes("projects.propose")} canManage={canManage} hasProblem={!!String(proposal.problem_description || "").trim()} hasBaseline={!!String(proposal.existing_data_summary || "").trim()} hasScope={!!String(proposal.proposed_scope || "").trim()} projectRecordId={projectLink?.target_record_id || null} />;
  }

  if (recordType === "INSPECTION") {
    const { data: event } = await supabase.from("inspection_events").select("id,visit_date,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!event) return null;
    const [{ data: links }, { count: evidenceCount }, { data: departments }, { data: profiles }] = await Promise.all([
      supabase.from("inspection_action_links").select("action_id,offset_days").eq("inspection_event_id", event.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
      supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
    ]);
    const actionIds = (links ?? []).map((x: any) => x.action_id).filter(Boolean);
    const { data: actions } = actionIds.length ? await supabase.from("actions").select("id,due_date,workflow_status").in("id", actionIds) : { data: [] as any[] };
    const actionMap = new Map((actions ?? []).map((x: any) => [x.id, x]));
    const milestones = (links ?? []).map((x: any) => ({ offset: Number(x.offset_days), status: actionMap.get(x.action_id)?.workflow_status || "NOT_STARTED", dueDate: actionMap.get(x.action_id)?.due_date || "—" }));
    const incomplete = (actions ?? []).filter((x: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status))).length;
    return <InspectionWorkflowClient recordId={recordId} status={event.workflow_status} visitDate={event.visit_date} canManage={user.permissions.includes("inspections.manage") || user.permissions.includes("plans.manage")} departments={(departments ?? []) as any[]} profiles={(profiles ?? []).map((p: any) => ({ ...p, id: p.user_id }))} milestones={milestones} evidenceCount={evidenceCount ?? 0} incompleteCount={incomplete} />;
  }

  if (recordType === "INDICATOR_MEASUREMENT") {
    const { data: measurement } = await supabase.from("indicator_measurements").select("id,indicator_assignment_id,workflow_status,numerator_value,denominator_value,raw_value,calculated_value,result_level").eq("record_id", recordId).maybeSingle();
    if (!measurement) return null;
    const { data: assignment } = await supabase.from("indicator_assignments").select("indicator_version_id,local_target").eq("id", measurement.indicator_assignment_id).maybeSingle();
    const { data: version } = assignment?.indicator_version_id ? await supabase.from("indicator_definition_versions").select("calculation_type,unit").eq("id", assignment.indicator_version_id).maybeSingle() : { data: null };
    const canManage = user.permissions.includes("indicators.manage");
    return <IndicatorWorkflowClient recordId={recordId} status={measurement.workflow_status} canEnter={canManage || user.permissions.includes("indicators.enter")} canVerify={canManage || user.permissions.includes("indicators.verify")} numerator={measurement.numerator_value} denominator={measurement.denominator_value} rawValue={measurement.raw_value} calculatedValue={measurement.calculated_value} resultLevel={measurement.result_level} localTarget={assignment?.local_target ?? null} unit={version?.unit ?? null} calculationType={version?.calculation_type ?? null} />;
  }

  if (recordType === "INCIDENT") {
    const { data: incident } = await supabase.from("incidents").select("id,workflow_status,investigation_required,rca_required").eq("record_id", recordId).maybeSingle();
    if (!incident) return null;
    const [{ data: report }, { data: links }, { count: evidenceCount }] = await Promise.all([
      supabase.from("incident_reports").select("initial_response_description").eq("incident_id", incident.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    ]);
    const actionRecordIds = (links ?? []).map((row: any) => row.target_record_id).filter(Boolean);
    const { data: actions } = actionRecordIds.length ? await supabase.from("actions").select("record_id,workflow_status").in("record_id", actionRecordIds) : { data: [] as any[] };
    const activeActions = (actions ?? []).filter((row: any) => !["CANCELLED", "NOT_APPLICABLE"].includes(String(row.workflow_status)));
    const incomplete = activeActions.filter((row: any) => row.workflow_status !== "COMPLETED").length;
    return <IncidentWorkflowClient recordId={recordId} status={incident.workflow_status} canTriage={user.permissions.includes("incident.triage")} canInvestigate={user.permissions.includes("incident.investigate") || user.permissions.includes("incident.triage")} canClose={user.permissions.includes("incident.close")} initialSafetyRecorded={!!String(report?.initial_response_description || "").trim()} investigationRequired={!!incident.investigation_required} rcaRequired={!!incident.rca_required} actionCount={activeActions.length} incompleteActionCount={incomplete} evidenceCount={evidenceCount ?? 0} />;
  }

  if (recordType === "CAPA") {
    const { data: capa } = await supabase.from("capas").select("id,workflow_status,approval_required,rca_analysis_id").eq("record_id", recordId).maybeSingle();
    if (!capa) return null;
    const [{ data: links }, { count: evidenceCount }, { count: reviewCount }, rcaResult] = await Promise.all([
      supabase.from("capa_action_links").select("action_id,action_type").eq("capa_id", capa.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
      supabase.from("capa_effectiveness_reviews").select("id", { count: "exact", head: true }).eq("capa_id", capa.id),
      capa.rca_analysis_id ? supabase.from("rca_analyses").select("status,conclusion").eq("id", capa.rca_analysis_id).maybeSingle() : Promise.resolve({ data: null }),
    ] as any);
    const actionIds = (links ?? []).map((row: any) => row.action_id).filter(Boolean);
    const { data: actions } = actionIds.length ? await supabase.from("actions").select("id,workflow_status").in("id", actionIds) : { data: [] as any[] };
    const incomplete = (actions ?? []).filter((row: any) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(row.workflow_status))).length;
    return <CapaWorkflowClient recordId={recordId} status={capa.workflow_status} canManage={user.permissions.includes("capa.manage")} approvalRequired={!!capa.approval_required} hasCompletedRca={rcaResult.data?.status === "COMPLETED" && !!String(rcaResult.data?.conclusion || "").trim()} correctiveCount={(links ?? []).filter((x: any) => x.action_type === "CORRECTIVE").length} preventiveCount={(links ?? []).filter((x: any) => x.action_type === "PREVENTIVE").length} incompleteActionCount={incomplete} evidenceCount={evidenceCount ?? 0} effectivenessReviewCount={reviewCount ?? 0} />;
  }

  if (recordType === "FINDING") {
    const { data: finding } = await supabase.from("findings").select("id,owner_user_id,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!finding) return null;
    const [{ data: links }, { count: evidenceCount }] = await Promise.all([
      supabase.from("finding_action_links").select("action_id").eq("finding_id", finding.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    ]);
    const actionIds = (links ?? []).map((row: any) => row.action_id).filter(Boolean);
    const { data: actions } = actionIds.length ? await supabase.from("actions").select("id,workflow_status").in("id", actionIds) : { data: [] as any[] };
    const incomplete = (actions ?? []).filter((row: any) => row.workflow_status !== "COMPLETED").length;
    const canManage = user.permissions.includes("findings.manage");
    const canOperate = canManage || finding.owner_user_id === user.id;
    return <FindingWorkflowClient recordId={recordId} status={finding.workflow_status} canOperate={canOperate} canManage={canManage} actionCount={actionIds.length} incompleteActionCount={incomplete} evidenceCount={evidenceCount ?? 0} />;
  }

  if (recordType === "RISK") {
    const { data: risk } = await supabase.from("risks").select("id,owner_user_id,workflow_status").eq("record_id", recordId).maybeSingle();
    if (!risk) return null;
    const [{ data: links }, { count: evidenceCount }, { data: latestAssessment }, { data: matrices }] = await Promise.all([
      supabase.from("risk_action_links").select("action_id").eq("risk_id", risk.id),
      supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
      supabase.from("risk_assessments").select("assessment_type,assessment_date,severity,likelihood,calculated_score,calculated_level,rationale").eq("risk_id", risk.id).order("assessment_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("risk_matrix_versions").select("id,name,version_no,effective_from,effective_to,severity_scale_max,likelihood_scale_max,status,published_at").eq("status", "PUBLISHED").order("effective_from", { ascending: false, nullsFirst: false }).order("published_at", { ascending: false, nullsFirst: false }),
    ]);
    const actionIds = (links ?? []).map((row: any) => row.action_id).filter(Boolean);
    const { data: actions } = actionIds.length ? await supabase.from("actions").select("id,workflow_status").in("id", actionIds) : { data: [] as any[] };
    const activeActions = (actions ?? []).filter((row: any) => !["CANCELLED", "NOT_APPLICABLE"].includes(row.workflow_status));
    const incomplete = activeActions.filter((row: any) => row.workflow_status !== "COMPLETED").length;
    const today = todayHcm();
    const effectiveMatrix = (matrices ?? []).find((row: any) => (!row.effective_from || row.effective_from <= today) && (!row.effective_to || row.effective_to >= today)) || (matrices ?? [])[0] || null;
    const matrix = effectiveMatrix ? {
      id: effectiveMatrix.id,
      name: effectiveMatrix.name,
      versionNo: effectiveMatrix.version_no,
      severityMax: effectiveMatrix.severity_scale_max,
      likelihoodMax: effectiveMatrix.likelihood_scale_max,
    } : null;
    const assessment = latestAssessment ? {
      assessmentType: latestAssessment.assessment_type,
      assessmentDate: latestAssessment.assessment_date,
      severity: latestAssessment.severity,
      likelihood: latestAssessment.likelihood,
      calculatedScore: latestAssessment.calculated_score,
      calculatedLevel: latestAssessment.calculated_level,
      rationale: latestAssessment.rationale,
    } : null;
    return <RiskWorkflowClient recordId={recordId} status={risk.workflow_status} canManage={user.permissions.includes("risk.manage")} actionCount={activeActions.length} incompleteActionCount={incomplete} evidenceCount={evidenceCount ?? 0} latestAssessment={assessment} matrix={matrix} />;
  }

  return null;
}
