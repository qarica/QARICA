import Link from "next/link";

type Props = { openFindings: number; overdueFindings: number; capaDue: number; projectPct: number };

export function TqmInterventionLoop({ openFindings, overdueFindings, capaDue, projectPct }: Props) {
  const stages = [
    { label: "Finding & RCA", value: `${openFindings} đang mở`, note: overdueFindings ? `${overdueFindings} quá hạn xử lý` : "Không có Finding quá hạn", href: "/findings", tone: overdueFindings ? "risk" : "watch" },
    { label: "CAPA & đánh giá hiệu lực", value: `${capaDue} cần đánh giá`, note: "Không đóng nếu chưa có bằng chứng hiệu lực", href: "/capa", tone: capaDue ? "risk" : "good" },
    { label: "Cải tiến & duy trì", value: `${projectPct}% tiến độ`, note: "Theo dõi kết quả, duy trì và nhân rộng", href: "/improvement/projects", tone: projectPct >= 85 ? "good" : "watch" },
  ];

  return (
    <section className="tqm-intervention-loop panel">
      <style>{`
        .tqm-intervention-loop{padding:18px}
        .tqm-loop-head{margin-bottom:13px}.tqm-loop-head h2{margin:0;font-size:16px}.tqm-loop-head p{margin:4px 0 0;color:#74838a;font-size:11px}
        .tqm-loop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .tqm-loop-card{display:block;border:1px solid #e1eaec;border-radius:14px;padding:14px;text-decoration:none;background:#fbfdfd;transition:.2s}
        .tqm-loop-card:hover{border-color:#9fc4eb;box-shadow:0 8px 18px rgba(16,40,72,.08);transform:translateY(-1px)}
        .tqm-loop-card header{display:flex;justify-content:space-between;gap:8px;align-items:center}.tqm-loop-card header strong{color:#244148;font-size:12px}
        .tqm-loop-card header i{width:9px;height:9px;border-radius:50%;background:#16a34a}.tqm-loop-card.watch header i{background:#d97706}.tqm-loop-card.risk header i{background:#dc2626}
        .tqm-loop-value{display:block;margin-top:16px;color:#173f45;font-size:23px;font-weight:850}
        .tqm-loop-note{display:block;margin-top:5px;color:#74868a;font-size:10px;line-height:1.4}
        @media(max-width:680px){.tqm-loop-grid{grid-template-columns:1fr}}
      `}</style>
      <div className="tqm-loop-head"><h2>Vòng can thiệp chất lượng</h2><p>Finding → RCA/Action → CAPA → đánh giá hiệu lực → cải tiến duy trì.</p></div>
      <div className="tqm-loop-grid">
        {stages.map((stage) => <Link href={stage.href} className={`tqm-loop-card ${stage.tone}`} key={stage.label}>
          <header><strong>{stage.label}</strong><i /></header>
          <span className="tqm-loop-value">{stage.value}</span>
          <span className="tqm-loop-note">{stage.note}</span>
        </Link>)}
      </div>
    </section>
  );
}
