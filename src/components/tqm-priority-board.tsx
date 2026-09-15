import Link from "next/link";

type Props = { serious: number; overdueFindings: number; capaDue: number; outTarget: number; planOverdue: number };

export function TqmPriorityBoard({ serious, overdueFindings, capaDue, outTarget, planOverdue }: Props) {
  const items = [
    { label: "Sự cố nghiêm trọng", value: serious, href: "/incidents", tone: "risk", action: "Mở điều tra/RCA" },
    { label: "Finding quá hạn", value: overdueFindings, href: "/findings", tone: "risk", action: "Rà Action & Evidence" },
    { label: "CAPA cần đánh giá", value: capaDue, href: "/capa", tone: "watch", action: "Đánh giá hiệu lực" },
    { label: "Chỉ số ngoài mục tiêu", value: outTarget, href: "/indicators", tone: "watch", action: "Xác minh dữ liệu" },
    { label: "Action kế hoạch quá hạn", value: planOverdue, href: "/tasks", tone: "watch", action: "Điều phối lại" },
  ];

  return <section className="tqm-priority-board panel">
    <style>{`
      .tqm-priority-board{padding:18px}.tqm-priority-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px;gap:12px}.tqm-priority-head h2{margin:0;font-size:16px}.tqm-priority-head p{margin:4px 0 0;color:#74838a;font-size:11px}.tqm-priority-board-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.tqm-priority-card{display:block;border:1px solid #e1eaec;border-radius:13px;padding:12px;text-decoration:none;background:#fbfdfd}.tqm-priority-card:hover{border-color:#e3b8c3;transform:translateY(-1px)}.tqm-priority-card header{display:flex;justify-content:space-between;gap:8px;color:#53696d;font-size:10px}.tqm-priority-card header i{width:8px;height:8px;border-radius:50%;background:#d97706}.tqm-priority-card.risk header i{background:#dc2626}.tqm-priority-card strong{display:block;margin-top:10px;font-size:26px;color:#152b49}.tqm-priority-card span{display:block;margin-top:3px;color:#75878b;font-size:10px}.tqm-priority-card small{display:block;margin-top:10px;color:#7a2740;font-size:10px;font-weight:800}@media(max-width:900px){.tqm-priority-board-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:580px){.tqm-priority-board-grid{grid-template-columns:1fr 1fr}.tqm-priority-head{display:block}}
    `}</style>
    <div className="tqm-priority-head"><div><h2>Ưu tiên điều hành hôm nay</h2><p>Danh sách tín hiệu cần quyết định hoặc phối hợp; số 0 nghĩa là chưa ghi nhận tín hiệu trong phạm vi dữ liệu.</p></div><span className="eyebrow">SMART OPS</span></div>
    <div className="tqm-priority-board-grid">{items.map((item)=><Link href={item.href} className={`tqm-priority-card ${item.tone}`} key={item.label}><header><span>{item.label}</span><i /></header><strong>{item.value}</strong><span>tín hiệu đang mở</span><small>{item.action} →</small></Link>)}</div>
  </section>;
}
