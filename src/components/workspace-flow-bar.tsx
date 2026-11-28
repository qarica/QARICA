import Link from "next/link";
import { Icon } from "@/components/icon";

// Khuôn dùng chung (lấy từ Kho hóa chất) cho mọi cụm nghiệp vụ: các tab theo ĐÚNG LUỒNG VIỆC nằm ngay trong trang
// + 1 thanh "Cần xử lý" dạng chip (bấm là tới đúng danh sách cần làm). Chỉ hiển thị; mỗi cụm tự tính số và quyền xem.
export type FlowTab = { key: string; label: string; href: string; count: number | null };
export type FlowChip = { n: number; tone: "danger" | "warning" | "info"; text: string; href: string };

export function WorkspaceFlowBar({ ariaLabel, tabs, active, chips, emptyText }: { ariaLabel: string; tabs: FlowTab[]; active: string; chips: FlowChip[]; emptyText: string }) {
  const visible = chips.filter((c) => c.n > 0);
  return <div className="cw-bar">
    <style>{`
      .cw-bar{display:flex;flex-direction:column;gap:10px}
      .cw-bar .cw-tabs{display:flex;flex-wrap:wrap;gap:2px;padding:4px;background:#eef2f7;border-radius:12px}
      @media(max-width:760px){.cw-bar .cw-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch}}
      .cw-bar .cw-tabs a{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;border-radius:9px;padding:9px 10px;font-weight:700;font-size:13px;color:#475569;white-space:nowrap}
      .cw-bar .cw-tabs a:hover{background:#f8fafc}
      .cw-bar .cw-tabs a.active{background:#fff;color:var(--brand-dark,#172554);box-shadow:0 1px 4px rgba(15,31,54,.14)}
      .cw-bar .cw-tabs .cw-step{font-size:10px;font-weight:800;color:#94a3b8}
      .cw-bar .cw-tabs .cw-count{font-size:11px;font-weight:800;background:#e2e8f0;color:#334155;border-radius:999px;padding:1px 7px}
      .cw-bar .cw-tabs a.active .cw-count{background:#dbeafe;color:#1d4ed8}
      .cw-bar .cw-attn{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:10px 14px}
      .cw-bar .cw-attn-title{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#475569}
      .cw-bar .cw-attn-items{display:flex;flex-wrap:wrap;gap:6px}
      .cw-bar .cw-attn-item{display:inline-flex;align-items:center;gap:7px;border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600}
      .cw-bar .cw-attn-item:before{content:"";width:8px;height:8px;border-radius:50%;background:#94a3b8}
      .cw-bar .cw-attn-item.danger:before{background:#dc2626}.cw-bar .cw-attn-item.warning:before{background:#f59e0b}.cw-bar .cw-attn-item.info:before{background:#3b82f6}
      .cw-bar .cw-attn-item:hover{background:#f1f5f9}
      .cw-bar .cw-attn-none{font-size:12px;color:var(--muted)}
    `}</style>
    <nav className="cw-tabs" aria-label={ariaLabel}>
      {tabs.map((t, i) => <Link key={t.key} href={t.href} className={t.key === active ? "active" : ""} aria-current={t.key === active ? "page" : undefined}>
        <span className="cw-step">{i + 1}</span>{t.label}{t.count !== null ? <span className="cw-count">{t.count}</span> : null}
      </Link>)}
    </nav>
    <div className="cw-attn">
      <span className="cw-attn-title"><Icon name="bell" size={16} /><strong>Cần xử lý</strong></span>
      {visible.length ? <div className="cw-attn-items">{visible.map((c) => <Link key={c.text} className={`cw-attn-item ${c.tone}`} href={c.href}>{c.text}</Link>)}</div> : <span className="cw-attn-none">{emptyText}</span>}
    </div>
  </div>;
}
