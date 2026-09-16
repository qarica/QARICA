import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Pillar = {
  key: string;
  label: string;
  score: number | null;
  detail: string;
};

type Recommendation = {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "info";
  rank: number;
};

const CLOSED_RECORD = new Set(["CANCELLED", "ARCHIVED", "INACTIVE", "RETIRED"]);
const DONE_ACTION = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pct(ok: number, total: number) {
  return total > 0 ? clamp((ok / total) * 100) : null;
}

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function dueBeforeToday(date: unknown, today: string) {
  if (!date) return false;
  return String(date).slice(0, 10) < today;
}

function scoreLabel(score: number | null) {
  if (score === null) return "Chưa đủ dữ liệu";
  if (score >= 85) return "Ổn định";
  if (score >= 70) return "Cần theo dõi";
  if (score >= 50) return "Cần cải thiện";
  return "Ưu tiên cao";
}

export async function TqmSmartCommandCenter({ year }: { year: number }) {
  const supabase = await createClient();
  const today = hcmToday();

  const [recordsRes, departmentsRes, plansRes, actionsRes, indicatorsRes, monitoringRes, findingsRes, capasRes, incidentsRes, feedbackRes] =
    await Promise.all([
      supabase
        .from("records")
        .select("id,record_type,lifecycle_status,owner_department_id")
        .eq("work_year", year),
      supabase.from("departments").select("id").eq("is_active", true),
      supabase
        .from("vw_program_progress")
        .select("program_id,record_id,required_actions,completed_actions,overdue_actions")
        .eq("work_year", year),
      supabase
        .from("vw_actions_dashboard")
        .select("action_id,record_id,workflow_status,due_date,is_overdue")
        .eq("work_year", year),
      supabase
        .from("indicator_measurements")
        .select("id,record_id,workflow_status,result_level,period_end"),
      supabase
        .from("monitoring_rounds")
        .select("id,record_id,work_year,workflow_status,target_department_id")
        .eq("work_year", year),
      supabase
        .from("findings")
        .select("id,record_id,workflow_status,due_date,severity"),
      supabase
        .from("capas")
        .select("id,record_id,workflow_status,effectiveness_due_date,priority"),
      supabase
        .from("incidents")
        .select("id,record_id,workflow_status,serious_event_flag,harm_status,reported_at"),
      supabase
        .from("feedback_records")
        .select("id,record_id,workflow_status,response_due_at"),
    ]);

  const errors = [
    recordsRes,
    departmentsRes,
    plansRes,
    actionsRes,
    indicatorsRes,
    monitoringRes,
    findingsRes,
    capasRes,
    incidentsRes,
    feedbackRes,
  ]
    .map((x: any) => x.error?.message)
    .filter(Boolean);

  const records = ((recordsRes.data ?? []) as any[]).filter(
    (row) => !CLOSED_RECORD.has(String(row.lifecycle_status)),
  );
  const recordIds = new Set(records.map((row) => row.id));

  const plans = ((plansRes.data ?? []) as any[]).filter((row) => recordIds.has(row.record_id));
  const requiredPlanActions = plans.reduce((sum, row) => sum + Number(row.required_actions || 0), 0);
  const completedPlanActions = plans.reduce((sum, row) => sum + Number(row.completed_actions || 0), 0);
  const overduePlanActions = plans.reduce((sum, row) => sum + Number(row.overdue_actions || 0), 0);
  const leadershipScore = pct(completedPlanActions, requiredPlanActions);

  const actions = ((actionsRes.data ?? []) as any[]).filter(
    (row) => recordIds.has(row.record_id) && !DONE_ACTION.has(String(row.workflow_status)),
  );
  const overdueActions = actions.filter(
    (row) => Boolean(row.is_overdue) || dueBeforeToday(row.due_date, today),
  ).length;

  const indicators = ((indicatorsRes.data ?? []) as any[]).filter(
    (row) =>
      recordIds.has(row.record_id) &&
      ["VERIFIED", "LOCKED"].includes(String(row.workflow_status)),
  );
  const evaluableIndicators = indicators.filter((row) =>
    ["MEETS_TARGET", "OUT_OF_TARGET"].includes(String(row.result_level)),
  );
  const indicatorsOnTarget = evaluableIndicators.filter(
    (row) => String(row.result_level) === "MEETS_TARGET",
  ).length;
  const outOfTarget = evaluableIndicators.length - indicatorsOnTarget;
  const dataScore = pct(indicatorsOnTarget, evaluableIndicators.length);

  const monitoring = ((monitoringRes.data ?? []) as any[]).filter((row) =>
    recordIds.has(row.record_id),
  );
  const roundIds = monitoring.map((row) => row.id);
  const responsesRes = roundIds.length
    ? await supabase
        .from("checklist_responses")
        .select("monitoring_round_id,result_status")
        .in("monitoring_round_id", roundIds)
    : { data: [] as any[], error: null };

  const responses = (responsesRes.data ?? []) as any[];
  const monitoringPass = responses.filter(
    (row) => String(row.result_status).toUpperCase() === "PASS",
  ).length;
  const monitoringFail = responses.filter(
    (row) => String(row.result_status).toUpperCase() === "FAIL",
  ).length;
  const processScore = pct(monitoringPass, monitoringPass + monitoringFail);

  const findings = ((findingsRes.data ?? []) as any[]).filter(
    (row) =>
      recordIds.has(row.record_id) &&
      !["CLOSED", "CANCELLED"].includes(String(row.workflow_status)),
  );
  const overdueFindings = findings.filter((row) => dueBeforeToday(row.due_date, today)).length;

  const capas = ((capasRes.data ?? []) as any[]).filter(
    (row) =>
      recordIds.has(row.record_id) &&
      !["CLOSED", "CANCELLED", "EFFECTIVE"].includes(String(row.workflow_status)),
  );
  const capaEffectivenessDue = capas.filter(
    (row) =>
      String(row.workflow_status) === "EFFECTIVENESS_REVIEW" ||
      dueBeforeToday(row.effectiveness_due_date, today),
  ).length;
  const improvementScore =
    findings.length + capas.length > 0
      ? clamp(
          100 -
            ((overdueFindings + capaEffectivenessDue) /
              Math.max(1, findings.length + capas.length)) *
              100,
        )
      : null;

  const incidents = ((incidentsRes.data ?? []) as any[]).filter(
    (row) =>
      recordIds.has(row.record_id) &&
      !["CLOSED", "CANCELLED"].includes(String(row.workflow_status)),
  );
  const seriousIncidents = incidents.filter((row) => Boolean(row.serious_event_flag)).length;

  const feedback = ((feedbackRes.data ?? []) as any[]).filter(
    (row) =>
      recordIds.has(row.record_id) &&
      !["CLOSED", "CANCELLED"].includes(String(row.workflow_status)),
  );
  const feedbackOverdue = feedback.filter((row) =>
    dueBeforeToday(row.response_due_at, today),
  ).length;
  const customerScore =
    feedback.length > 0 ? clamp(100 - (feedbackOverdue / feedback.length) * 100) : null;

  const totalDepartments = (departmentsRes.data ?? []).length;
  const activeDepartmentIds = new Set(
    records.map((row) => row.owner_department_id).filter(Boolean),
  );
  const participationScore = pct(activeDepartmentIds.size, totalDepartments);

  const pillars: Pillar[] = [
    {
      key: "customer",
      label: "Hướng tới người bệnh/khách hàng",
      score: customerScore,
      detail:
        feedback.length > 0
          ? `${feedbackOverdue}/${feedback.length} phản ánh đang mở quá hạn phản hồi`
          : "Chưa có phản ánh mở đủ dữ liệu để tính SLA",
    },
    {
      key: "process",
      label: "Tiếp cận theo quá trình",
      score: processScore,
      detail:
        monitoringPass + monitoringFail > 0
          ? `${monitoringPass}/${monitoringPass + monitoringFail} mục giám sát đạt`
          : "Chưa có kết quả checklist đủ dữ liệu",
    },
    {
      key: "improvement",
      label: "Cải tiến liên tục",
      score: improvementScore,
      detail: `${overdueFindings} Finding quá hạn · ${capaEffectivenessDue} CAPA cần đánh giá hiệu lực`,
    },
    {
      key: "data",
      label: "Ra quyết định dựa trên dữ liệu",
      score: dataScore,
      detail:
        evaluableIndicators.length > 0
          ? `${indicatorsOnTarget}/${evaluableIndicators.length} kỳ chỉ số đạt mục tiêu`
          : "Chưa có kỳ chỉ số VERIFIED/LOCKED đủ điều kiện",
    },
    {
      key: "participation",
      label: "Sự tham gia toàn viện",
      score: participationScore,
      detail:
        totalDepartments > 0
          ? `${activeDepartmentIds.size}/${totalDepartments} khoa/phòng có hồ sơ hoạt động năm ${year}`
          : "Chưa có danh mục khoa/phòng hoạt động",
    },
    {
      key: "leadership",
      label: "Lãnh đạo & liên kết chiến lược",
      score: leadershipScore,
      detail:
        requiredPlanActions > 0
          ? `${completedPlanActions}/${requiredPlanActions} Action kế hoạch hoàn thành · ${overduePlanActions} quá hạn`
          : "Chưa có Action kế hoạch đủ dữ liệu",
    },
  ];

  const availableScores = pillars
    .map((pillar) => pillar.score)
    .filter((score): score is number => score !== null);
  const tqmIndex =
    availableScores.length > 0
      ? clamp(availableScores.reduce((sum, score) => sum + score, 0) / availableScores.length)
      : null;

  // Operational priority index: higher = more attention needed.
  // It is NOT a clinical risk score and never replaces workflow decisions.
  const priorityIndex = clamp(
    seriousIncidents * 22 +
      overdueFindings * 8 +
      capaEffectivenessDue * 7 +
      outOfTarget * 5 +
      feedbackOverdue * 5 +
      Math.min(overdueActions, 10) * 3,
  );

  const recommendations: Recommendation[] = [];

  if (seriousIncidents > 0) {
    recommendations.push({
      key: "incident",
      title: `${seriousIncidents} sự cố nghiêm trọng đang mở`,
      detail:
        "Ưu tiên xác minh, điều tra/RCA theo mức độ và bảo đảm Action an toàn được theo dõi đến minh chứng.",
      href: "/incidents",
      severity: "critical",
      rank: 100,
    });
  }
  if (overdueFindings > 0) {
    recommendations.push({
      key: "finding",
      title: `${overdueFindings} Finding đã quá hạn`,
      detail:
        "Rà người phụ trách, Action khắc phục, minh chứng và lịch recheck; không đóng khi chưa chứng minh kết quả.",
      href: "/findings",
      severity: "critical",
      rank: 94,
    });
  }
  if (capaEffectivenessDue > 0) {
    recommendations.push({
      key: "capa",
      title: `${capaEffectivenessDue} CAPA cần đánh giá hiệu lực`,
      detail:
        "Đối chiếu mục tiêu với dữ liệu sau can thiệp trước khi kết luận CAPA có hiệu lực.",
      href: "/capa",
      severity: "warning",
      rank: 90,
    });
  }
  if (outOfTarget > 0) {
    recommendations.push({
      key: "indicator",
      title: `${outOfTarget} kỳ chỉ số ngoài mục tiêu`,
      detail:
        "Xác minh dữ liệu trước, phân tích nguyên nhân sau; chỉ sinh Action/CAPA khi có căn cứ nghiệp vụ.",
      href: "/indicators",
      severity: "warning",
      rank: 86,
    });
  }
  if (overdueActions > 0) {
    recommendations.push({
      key: "action",
      title: `${overdueActions} Action đang quá hạn`,
      detail:
        "Ưu tiên Action gắn sự cố/Finding/CAPA/chỉ đạo trước, sau đó xử lý các Action kế hoạch còn lại.",
      href: "/tasks",
      severity: "warning",
      rank: 82,
    });
  }
  if (feedbackOverdue > 0) {
    recommendations.push({
      key: "feedback",
      title: `${feedbackOverdue} phản ánh quá hạn phản hồi`,
      detail:
        "Xác minh và phản hồi đúng luồng; vấn đề mang tính hệ thống cần chuyển Finding/Action/CAPA.",
      href: "/feedback",
      severity: "warning",
      rank: 80,
    });
  }
  if (processScore !== null && processScore < 80) {
    recommendations.push({
      key: "monitoring",
      title: `Tỷ lệ đạt giám sát hiện ${processScore}%`,
      detail:
        "Phân tích nhóm lỗi lặp lại theo khoa/phòng/quá trình và ưu tiên can thiệp vào nguyên nhân hệ thống.",
      href: "/monitoring",
      severity: "info",
      rank: 70,
    });
  }

  recommendations.sort((a, b) => b.rank - a.rank);
  const topRecommendations = recommendations.slice(0, 5);

  return (
    <section className="tqm-smart-center">
      <style>{`
        .tqm-smart-center{display:grid;gap:14px}
        .tqm-smart-head{display:grid;grid-template-columns:.72fr 1.28fr;gap:14px}
        .tqm-smart-index,.tqm-smart-priority{border:1px solid #dfe8e9;border-radius:20px;background:#fff;padding:18px;box-shadow:0 8px 24px rgba(23,57,63,.05)}
        .tqm-smart-index{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:16px}
        .tqm-smart-ring{width:94px;height:94px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#1d3f73 calc(var(--score)*1%),#e8efef 0);position:relative}
        .tqm-smart-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:#fff}
        .tqm-smart-ring strong{position:relative;z-index:1;font-size:25px}
        .tqm-smart-index h3,.tqm-smart-priority h3{margin:0;font-size:16px}
        .tqm-smart-index p,.tqm-smart-priority p{margin:5px 0 0;color:#65777d;font-size:11px;line-height:1.5}
        .tqm-smart-priority{background:linear-gradient(135deg,#102848,#1d3f73);color:white;border-color:transparent}
        .tqm-smart-priority p{color:#d8efec}
        .tqm-priority-number{font-size:38px;font-weight:850;line-height:1;margin:9px 0 4px}
        .tqm-pillar-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .tqm-pillar{border:1px solid #e0e9eb;border-radius:16px;background:#fff;padding:14px}
        .tqm-pillar-top{display:flex;justify-content:space-between;gap:8px;align-items:start}
        .tqm-pillar h4{margin:0;font-size:12px;line-height:1.35}
        .tqm-pillar strong{font-size:18px}
        .tqm-pillar p{margin:7px 0 0;color:#6b7d83;font-size:10px;line-height:1.45}
        .tqm-mini-track{height:6px;border-radius:999px;background:#edf2f2;overflow:hidden;margin-top:10px}
        .tqm-mini-track span{display:block;height:100%;border-radius:inherit;background:#1d3f73}
        .tqm-smart-actions{border:1px solid #e0e9eb;border-radius:18px;background:#fff;padding:16px}
        .tqm-smart-actions-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}
        .tqm-smart-actions-head h3{margin:0;font-size:15px}.tqm-smart-actions-head p{margin:4px 0 0;color:#6b7d83;font-size:10px}
        .tqm-smart-action-list{display:grid;gap:8px}
        .tqm-smart-action{display:grid;grid-template-columns:8px 1fr auto;gap:10px;align-items:center;border:1px solid #e6ecee;border-radius:12px;padding:11px}
        .tqm-smart-action i{width:8px;height:38px;border-radius:999px;background:#2563eb}
        .tqm-smart-action.critical i{background:#dc2626}.tqm-smart-action.warning i{background:#d97706}
        .tqm-smart-action strong{display:block;font-size:11px}.tqm-smart-action span{display:block;color:#6b7d83;font-size:9.5px;margin-top:3px;line-height:1.4}
        .tqm-smart-empty{padding:14px;border:1px dashed #cbd7da;border-radius:12px;color:#6b7d83;font-size:11px;text-align:center}
        .tqm-smart-error{padding:10px 12px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a4b0a;font-size:10px}
        @media(max-width:980px){.tqm-smart-head{grid-template-columns:1fr}.tqm-pillar-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.tqm-pillar-grid{grid-template-columns:1fr}.tqm-smart-index{grid-template-columns:1fr}.tqm-smart-action{grid-template-columns:8px 1fr}.tqm-smart-action .button{grid-column:2;width:100%}}
      `}</style>

      {errors.length ? (
        <div className="tqm-smart-error">
          Một số nguồn TQM chưa đọc được đầy đủ: {errors.slice(0, 2).join(" · ")}.
          Chỉ số dưới đây chỉ dùng các nguồn truy cập được.
        </div>
      ) : null}

      <div className="tqm-smart-head">
        <article className="tqm-smart-index">
          <div
            className="tqm-smart-ring"
            style={{ ["--score" as string]: tqmIndex ?? 0 }}
            aria-label="Chỉ số vận hành TQM"
          >
            <strong>{tqmIndex === null ? "—" : `${tqmIndex}`}</strong>
          </div>
          <div>
            <h3>Chỉ số vận hành TQM</h3>
            <p>
              {tqmIndex === null
                ? "Chưa đủ dữ liệu để tổng hợp."
                : `${scoreLabel(tqmIndex)} · trung bình các trụ cột có dữ liệu thật.`}
            </p>
            <p>Không dùng số giả; trụ cột thiếu mẫu sẽ hiển thị “Chưa đủ dữ liệu”.</p>
          </div>
        </article>

        <article className="tqm-smart-priority">
          <h3>Smart Quality Priority Index</h3>
          <div className="tqm-priority-number">{priorityIndex}/100</div>
          <p>
            Chỉ số ưu tiên vận hành từ tín hiệu thực tế: sự cố nghiêm trọng, Finding/CAPA,
            chỉ số lệch mục tiêu, phản ánh và Action quá hạn. Đây không phải điểm rủi ro lâm sàng.
          </p>
        </article>
      </div>

      <div className="tqm-pillar-grid">
        {pillars.map((pillar) => (
          <article className="tqm-pillar" key={pillar.key}>
            <div className="tqm-pillar-top">
              <h4>{pillar.label}</h4>
              <strong>{pillar.score === null ? "—" : `${pillar.score}%`}</strong>
            </div>
            <div className="tqm-mini-track">
              <span style={{ width: `${pillar.score ?? 0}%` }} />
            </div>
            <p>
              {pillar.score === null ? "Chưa đủ dữ liệu · " : `${scoreLabel(pillar.score)} · `}
              {pillar.detail}
            </p>
          </article>
        ))}
      </div>

      <article className="tqm-smart-actions">
        <div className="tqm-smart-actions-head">
          <div>
            <h3>Ưu tiên hệ thống đề xuất</h3>
            <p>Luật quyết định minh bạch, dựa trên dữ liệu; không tự thay người dùng ra quyết định nghiệp vụ.</p>
          </div>
          <Link href="/assistant" className="button secondary small">
            Mở Trợ lý QLCL
          </Link>
        </div>

        <div className="tqm-smart-action-list">
          {topRecommendations.map((item) => (
            <div className={`tqm-smart-action ${item.severity}`} key={item.key}>
              <i />
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <Link href={item.href} className="button primary small">
                Xử lý
              </Link>
            </div>
          ))}
          {!topRecommendations.length ? (
            <div className="tqm-smart-empty">
              Chưa có tín hiệu ưu tiên cao trong phạm vi dữ liệu hiện tại.
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}
