import Link from "next/link";

type Props = { serious: number; overdueFindings: number; capaDue: number; outTarget: number; planOverdue: number };

export function TqmPriorityBoard({ serious, overdueFindings, capaDue, outTarget, planOverdue }: Props) {
  const items = [
    { label: "Sự cố nghiêm trọng", value: serious, href: "/incidents", tone: "risk", statusText: "Nghiêm trọng", action: "Mở điều tra/RCA" },
    { label: "Finding quá hạn", value: overdueFindings, href: "/findings", tone: "risk", statusText: "Nghiêm trọng", action: "Rà Action & Evidence" },
    { label: "CAPA cần đánh giá", value: capaDue, href: "/capa", tone: "watch", statusText: "Cần theo dõi", action: "Đánh giá hiệu lực" },
    { label: "Chỉ số ngoài mục tiêu", value: outTarget, href: "/indicators", tone: "watch", statusText: "Cần theo dõi", action: "Xác minh dữ liệu" },
    { label: "Action kế hoạch quá hạn", value: planOverdue, href: "/tasks", tone: "watch", statusText: "Cần theo dõi", action: "Điều phối lại" },
  ];

  return <section className="tqm-priority-board panel">
    <style>{`
      .tqm-priority-board{padding:14px 15px}.tqm-priority-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:9px;gap:12px}.tqm-priority-head h2{margin:0;font-size:14px}.tqm-priority-head p{margin:3px 0 0;color:#74838a;font-size:10px}.tqm-priority-board-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.tqm-priority-card{display:block;border:1px solid #dce7ef;border-radius:11px;padding:9px 10px;text-decoration:none;background:#f5f8fc;transition:.18s}.tqm-priority-card.watch{background:#fff8ed;border-color:#f0dfc2}.tqm-priority-card.risk{background:#fff3f3;border-color:#f1d0d0}.tqm-priority-card:hover{border-color:#8fb0d1;transform:translateY(-1px);box-shadow:0 4px 11px rgba(16,40,72,.06)}.tqm-priority-card header{display:flex;justify-content:space-between;gap:8px;color:#53696d;font-size:9px}.tqm-priority-status{display:inline-flex;align-items:center;gap:4px;font-weight:800}.tqm-priority-status i{width:7px;height:7px;border-radius:50%;background:#b7791f;flex:none}.tqm-priority-card.risk .tqm-priority-status i{background:#c84350}.tqm-priority-card.risk .tqm-priority-status{color:#a72b35}.tqm-priority-card.watch .tqm-priority-status{color:#9a5a05}.tqm-priority-card strong{display:block;margin-top:6px;font-size:21px;color:#152b49}.tqm-priority-card span{display:block;margin-top:2px;color:#75878b;font-size:9px}.tqm-priority-card small{display:block;margin-top:6px;color:#315f91;font-size:9px;font-weight:800}@media(max-width:900px){.tqm-priority-board-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:580px){.tqm-priority-board-grid{grid-template-columns:1fr 1fr}.tqm-priority-head{display:block}}
    `}</style>
    <div className="tqm-priority-head"><div><h2>Ưu tiên điều hành hôm nay</h2><p>Danh sách tín hiệu cần quyết định hoặc phối hợp; số 0 nghĩa là chưa ghi nhận tín hiệu trong phạm vi dữ liệu.</p></div><span className="eyebrow">SMART OPS</span></div>
    <div className="tqm-priority-board-grid">{items.map((item)=><Link href={item.href} className={`tqm-priority-card ${item.tone}`} key={item.label}><header><span>{item.label}</span><span className="tqm-priority-status"><i />{item.statusText}</span></header><strong>{item.value}</strong><span>tín hiệu đang mở</span><small>{item.action} →</small></Link>)}</div>
  </section>;
}
