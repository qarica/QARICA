import Link from "next/link";

type ProcessMapProps = {
  planPct: number;
  indicatorPct: number;
  monitoringPct: number;
  openFindings: number;
  capaDue: number;
  projectPct: number;
};

const steps = [
  { key: "plan", label: "Mục tiêu & kế hoạch", href: "/plans", tone: "teal" },
  { key: "measure", label: "Đo lường chất lượng", href: "/indicators", tone: "blue" },
  { key: "monitor", label: "Giám sát quá trình", href: "/monitoring", tone: "violet" },
  { key: "problem", label: "Vấn đề / Finding", href: "/findings", tone: "amber" },
  { key: "action", label: "CAPA & hành động", href: "/capa", tone: "orange" },
  { key: "improve", label: "Cải tiến & kết quả", href: "/improvement/projects", tone: "green" },
] as const;

export function TqmProcessMap({ planPct, indicatorPct, monitoringPct, openFindings, capaDue, projectPct }: ProcessMapProps) {
  const values: Record<string, string> = {
    plan: `${planPct}% hoàn thành`,
    measure: `${indicatorPct}% đạt mục tiêu`,
    monitor: `${monitoringPct}% đạt`,
    problem: `${openFindings} đang mở`,
    action: `${capaDue} cần đánh giá`,
    improve: `${projectPct}% tiến độ`,
  };

  return (
    <section className="tqm-process-map panel">
      <style>{`
        .tqm-process-map{padding:18px}
        .tqm-process-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:14px}
        .tqm-process-head h2{margin:0;font-size:16px}
        .tqm-process-head p{margin:4px 0 0;color:#74838a;font-size:11px;line-height:1.45}
        .tqm-process-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
        .tqm-process-step{position:relative;display:block;min-height:106px;border:1px solid #e1eaec;border-radius:14px;background:#fbfdfd;padding:13px 11px;text-decoration:none;transition:.2s}
        .tqm-process-step:hover{transform:translateY(-2px);border-color:#9fc4eb;box-shadow:0 8px 18px rgba(16,40,72,.08)}
        .tqm-process-step:not(:last-child):after{content:"→";position:absolute;right:-12px;top:42px;color:#9aabad;font-size:18px;z-index:2}
        .tqm-process-dot{width:10px;height:10px;border-radius:50%;margin-bottom:11px;background:#1d3f73}
        .tqm-process-step.blue .tqm-process-dot{background:#2563eb}.tqm-process-step.violet .tqm-process-dot{background:#7c3aed}.tqm-process-step.amber .tqm-process-dot{background:#d97706}.tqm-process-step.orange .tqm-process-dot{background:#ea580c}.tqm-process-step.green .tqm-process-dot{background:#16a34a}
        .tqm-process-step strong{display:block;color:#244148;font-size:11px;line-height:1.35}
        .tqm-process-step span{display:block;margin-top:9px;color:#6e8084;font-size:10px}
        @media(max-width:1000px){.tqm-process-grid{grid-template-columns:repeat(3,1fr)}.tqm-process-step:nth-child(3):after{display:none}}
        @media(max-width:620px){.tqm-process-grid{grid-template-columns:1fr 1fr}.tqm-process-step:nth-child(2n):after{display:none}.tqm-process-step{min-height:96px}}
      `}</style>
      <div className="tqm-process-head">
        <div>
          <h2>Process Map chất lượng toàn viện</h2>
          <p>Từ mục tiêu đến kết quả cải tiến; nhấn từng bước để đi xuống dữ liệu nguồn.</p>
        </div>
        <span className="eyebrow">TQM FLOW</span>
      </div>
      <div className="tqm-process-grid">
        {steps.map((step) => (
          <Link href={step.href} className={`tqm-process-step ${step.tone}`} key={step.key}>
            <div className="tqm-process-dot" />
            <strong>{step.label}</strong>
            <span>{values[step.key]}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
