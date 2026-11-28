import Link from "next/link";
import { Icon } from "@/components/icon";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { countCapaEffectivenessDue, countOverdueFindings, isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";

// KHẮC PHỤC & CAPA — dựng theo khuôn đã dùng ở Kho hóa chất (lab-supplies-client.tsx):
//   1 thanh "Cần xử lý" dạng chip (bấm là tới đúng danh sách cần làm) + các tab theo ĐÚNG LUỒNG VIỆC nằm ngay trong trang:
//   Phát hiện → CAPA đang xử lý → Đánh giá hiệu lực → Đã đóng → Phân tích.
// Không xóa trang nào: /findings và /capa vẫn là 2 trang thật (sidebar vẫn trỏ tới), thanh này chỉ đặt chúng vào cùng 1 luồng.
// Số đếm dùng chung quality-priority-signals.ts với Dashboard nên không lệch nhau.

export type CorrectiveTab = "findings" | "capa" | "review" | "closed" | "analytics";

const CAPA_CLOSED = new Set(["EFFECTIVE", "CLOSED", "CANCELLED"]);

export async function CorrectiveWorkspaceBar({ active, year }: { active: CorrectiveTab; year: number }) {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const recordsRes = await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", ["FINDING", "CAPA"]).eq("work_year", year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const findingIds = records.filter((r) => r.record_type === "FINDING").map((r) => r.id);
  const capaIds = records.filter((r) => r.record_type === "CAPA").map((r) => r.id);
  const [findingsRes, capasRes] = await Promise.all([
    findingIds.length ? supabase.from("findings").select("id,record_id,workflow_status,due_date").in("record_id", findingIds) : Promise.resolve({ data: [] as any[], error: null }),
    capaIds.length ? supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date").in("record_id", capaIds) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const findings = (findingsRes.data ?? []) as any[];
  const capas = (capasRes.data ?? []) as any[];

  const findingOpen = findings.filter((x) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status))).length;
  const findingOverdue = countOverdueFindings(findings, today);
  const capaActive = capas.filter((x) => !CAPA_CLOSED.has(String(x.workflow_status)));
  const capaPendingApproval = capaActive.filter((x) => String(x.workflow_status) === "PENDING_APPROVAL").length;
  const capaReviewDue = countCapaEffectivenessDue(capas, today);
  const capaReviewOverdue = capaActive.filter((x) => isPastDue(x.effectiveness_due_date, today)).length;
  const capaClosed = capas.length - capaActive.length;

  const chips = [
    { n: findingOverdue, tone: "danger", text: `${findingOverdue} Finding quá hạn — cần rà Action & minh chứng`, href: "/findings?overdue=1" },
    { n: capaReviewOverdue, tone: "danger", text: `${capaReviewOverdue} CAPA quá hạn đánh giá hiệu lực`, href: "/capa?tab=review" },
    { n: capaPendingApproval, tone: "warning", text: `${capaPendingApproval} CAPA chờ phê duyệt`, href: "/capa?status=PENDING_APPROVAL" },
    { n: capaReviewDue - capaReviewOverdue, tone: "info", text: `${Math.max(0, capaReviewDue - capaReviewOverdue)} CAPA đang chờ đánh giá hiệu lực`, href: "/capa?tab=review" },
  ].filter((c) => c.n > 0);

  const tabs: { key: CorrectiveTab; label: string; href: string; count: number | null }[] = [
    { key: "findings", label: "Phát hiện", href: "/findings", count: findingOpen },
    { key: "capa", label: "CAPA đang xử lý", href: "/capa", count: capaActive.length },
    { key: "review", label: "Đánh giá hiệu lực", href: "/capa?tab=review", count: capaReviewDue },
    { key: "closed", label: "Đã đóng", href: "/capa?tab=closed", count: capaClosed },
    { key: "analytics", label: "Phân tích", href: "/capa?tab=analytics", count: null },
  ];

  return <div className="cw-bar">
    <style>{`
      .cw-bar{display:flex;flex-direction:column;gap:10px}
      .cw-bar .cw-tabs{display:flex;gap:4px;overflow-x:auto;padding:4px;background:#eef2f7;border-radius:12px;-webkit-overflow-scrolling:touch}
      .cw-bar .cw-tabs a{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;border-radius:9px;padding:9px 16px;font-weight:700;font-size:13px;color:#475569;white-space:nowrap}
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
    <nav className="cw-tabs" aria-label="Luồng việc Khắc phục & CAPA">
      {tabs.map((t, i) => <Link key={t.key} href={t.href} className={t.key === active ? "active" : ""} aria-current={t.key === active ? "page" : undefined}>
        <span className="cw-step">{i + 1}</span>{t.label}{t.count !== null ? <span className="cw-count">{t.count}</span> : null}
      </Link>)}
    </nav>
    <div className="cw-attn">
      <span className="cw-attn-title"><Icon name="bell" size={16} /><strong>Cần xử lý</strong></span>
      {chips.length ? <div className="cw-attn-items">{chips.map((c) => <Link key={c.text} className={`cw-attn-item ${c.tone}`} href={c.href}>{c.text}</Link>)}</div> : <span className="cw-attn-none">Không có Finding hay CAPA nào cần xử lý gấp.</span>}
    </div>
  </div>;
}
