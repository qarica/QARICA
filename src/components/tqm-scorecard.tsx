import Link from "next/link";

type ScorecardProps = {
  planPct: number;
  indicatorPct: number;
  monitoringPct: number;
  projectPct: number;
  seriousIncidents: number;
  overdueFindings: number;
};

type Row = { label: string; value: string; status: string; tone: "good" | "watch" | "risk"; href: string };

function toneFor(value: number, inverse = false): Row["tone"] {
  const score = inverse ? 100 - Math.min(100, value) : value;
  return score >= 85 ? "good" : score >= 70 ? "watch" : "risk";
}

export function TqmScorecard({ planPct, indicatorPct, monitoringPct, projectPct, seriousIncidents, overdueFindings }: ScorecardProps) {
  const rows: Row[] = [
    { label: "Lãnh đạo & liên kết chiến lược", value: `${planPct}% kế hoạch`, status: planPct >= 85 ? "Ổn định" : "Cần theo dõi", tone: toneFor(planPct), href: "/plans" },
    { label: "Ra quyết định dựa trên dữ liệu", value: `${indicatorPct}% đạt mục tiêu`, status: indicatorPct >= 85 ? "Ổn định" : "Cần cải thiện", tone: toneFor(indicatorPct), href: "/indicators" },
    { label: "Tiếp cận theo quá trình", value: `${monitoringPct}% giám sát đạt`, status: monitoringPct >= 85 ? "Ổn định" : "Cần theo dõi", tone: toneFor(monitoringPct), href: "/monitoring" },
    { label: "Cải tiến liên tục", value: `${projectPct}% tiến độ đề án`, status: projectPct >= 85 ? "Ổn định" : "Cần theo dõi", tone: toneFor(projectPct), href: "/improvement/projects" },
    { label: "An toàn người bệnh", value: `${seriousIncidents} sự cố nghiêm trọng mở`, status: seriousIncidents === 0 ? "Ổn định" : "Ưu tiên", tone: toneFor(seriousIncidents, true), href: "/incidents" },
    { label: "Khắc phục có kiểm soát", value: `${overdueFindings} Finding quá hạn`, status: overdueFindings === 0 ? "Ổn định" : "Ưu tiên", tone: toneFor(overdueFindings, true), href: "/findings" },
  ];

  return (
    <section className="tqm-scorecard panel">
      <style>{`
        .tqm-scorecard{padding:18px}
        .tqm-scorecard-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:12px}
        .tqm-scorecard-head h2{margin:0;font-size:16px}
        .tqm-scorecard-head p{margin:4px 0 0;color:#74838a;font-size:11px}
        .tqm-scorecard-note{color:#718286;font-size:10px}
        .tqm-scorecard-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .tqm-scorecard-row{display:grid;grid-template-columns:7px 1fr auto;gap:10px;align-items:center;border:1px solid #e1eaec;border-radius:13px;padding:11px;text-decoration:none;background:#fff;transition:.2s}
        .tqm-scorecard-row:hover{border-color:#9fc4eb;background:#fbfefe;transform:translateY(-1px)}
        .tqm-scorecard-row i{width:7px;height:38px;border-radius:99px;background:#16a34a}
        .tqm-scorecard-row.watch i{background:#d97706}.tqm-scorecard-row.risk i{background:#dc2626}
        .tqm-scorecard-row strong{display:block;color:#244148;font-size:11px;line-height:1.35}
        .tqm-scorecard-row span{display:block;color:#74868a;font-size:10px;margin-top:4px}
        .tqm-scorecard-status{font-size:9px!important;font-weight:800;color:#1d3f73!important;background:#e6eef8;border-radius:999px;padding:5px 7px;margin:0!important;white-space:nowrap}
        .tqm-scorecard-row.watch .tqm-scorecard-status{color:#9a5a05!important;background:#fff7e8}
        .tqm-scorecard-row.risk .tqm-scorecard-status{color:#a72b35!important;background:#fff0f1}
        @media(max-width:900px){.tqm-scorecard-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:580px){.tqm-scorecard-grid{grid-template-columns:1fr}.tqm-scorecard-head{display:block}.tqm-scorecard-note{display:block;margin-top:8px}}
      `}</style>
      <div className="tqm-scorecard-head">
        <div>
          <h2>TQM Scorecard · 6 trụ cột vận hành</h2>
          <p>Đọc nhanh trạng thái quản trị; nhấn từng dòng để xem dữ liệu nghiệp vụ.</p>
        </div>
        <span className="tqm-scorecard-note">Số liệu lấy từ dữ liệu thật hiện có</span>
      </div>
      <div className="tqm-scorecard-grid">
        {rows.map((row) => (
          <Link href={row.href} className={`tqm-scorecard-row ${row.tone}`} key={row.label}>
            <i />
            <div><strong>{row.label}</strong><span>{row.value}</span></div>
            <span className="tqm-scorecard-status">{row.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
