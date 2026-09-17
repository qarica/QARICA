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
        .tqm-process-map{padding:14px 15px}
        .tqm-process-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:10px}
        .tqm-process-head h2{margin:0;font-size:14px}
        .tqm-process-head p{margin:3px 0 0;color:#74838a;font-size:10px;line-height:1.4}
        .tqm-process-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
        .tqm-process-step{position:relative;display:block;min-height:78px;border:1px solid #dce7ef;border-radius:11px;background:#f6f9fc;padding:9px 9px;text-decoration:none;transition:.18s}
        .tqm-process-step.teal{background:#f0f8f7}.tqm-process-step.blue{background:#f1f6fc}.tqm-process-step.violet{background:#f7f4fc}.tqm-process-step.amber{background:#fff8ed}.tqm-process-step.orange{background:#fff5ef}.tqm-process-step.green{background:#f1f8f3}
        .tqm-process-step:hover{transform:translateY(-1px);border-color:#8fb0d1;box-shadow:0 5px 12px rgba(16,40,72,.07)}
        .tqm-process-step:not(:last-child):after{content:"→";position:absolute;right:-11px;top:29px;color:#9aabad;font-size:15px;z-index:2}
        .tqm-process-dot{width:8px;height:8px;border-radius:50%;margin-bottom:7px;background:#0f766e}
        .tqm-process-step.blue .tqm-process-dot{background:#315f91}.tqm-process-step.violet .tqm-process-dot{background:#7353a6}.tqm-process-step.amber .tqm-process-dot{background:#b7791f}.tqm-process-step.orange .tqm-process-dot{background:#c86b32}.tqm-process-step.green .tqm-process-dot{background:#3b7f5a}
        .tqm-process-step strong{display:block;color:#244148;font-size:10px;line-height:1.3}
        .tqm-process-step span{display:block;margin-top:5px;color:#6e8084;font-size:9px}
        @media(max-width:1000px){.tqm-process-grid{grid-template-columns:repeat(3,1fr)}.tqm-process-step:nth-child(3):after{display:none}}
        @media(max-width:620px){.tqm-process-grid{grid-template-columns:1fr 1fr}.tqm-process-step:nth-child(2n):after{display:none}.tqm-process-step{min-height:72px}}
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
