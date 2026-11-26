"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { LabCatalog } from "@/components/lab-supplies-catalog";
import { LabItemDetail } from "@/components/lab-supplies-detail";
import { LabLedger } from "@/components/lab-supplies-ledger";
import { LabScanDialog } from "@/components/lab-supplies-scanner";
import { LabStock } from "@/components/lab-supplies-stock";
import { LabStocktake } from "@/components/lab-supplies-stocktake";
import { num, type Closing, type Item, type Lot, type Movement, type Toast } from "@/components/lab-supplies-types";
import { LabVoucher, type VoucherIncoming } from "@/components/lab-supplies-voucher";
import { findItemByScan } from "@/lib/lab-supplies";

// KHO HÓA CHẤT & VTYT XN — bố cục theo ĐÚNG LUỒNG VIỆC của thủ kho:
//   Tồn kho (xem còn gì, cần làm gì) → Nhập kho (hàng về) → Xuất kho (cấp phát/hủy) → Kiểm kê & chốt kỳ → Sổ kho & báo cáo → Danh mục (thiết lập).
// Một thanh "Tìm hoặc quét mã" dùng chung; quét mã tùy màn hình đang mở: ở Tồn kho/Sổ/Danh mục → mở chi tiết vật tư,
// ở Nhập/Xuất → thêm một dòng vào phiếu. Mỗi nghiệp vụ chỉ có MỘT nơi làm (không còn nút/tab trùng nhau).
type Tab = "stock" | "receipt" | "issue" | "stocktake" | "ledger" | "catalog";
const TAB_LABEL: Record<Tab, string> = { stock: "Tồn kho", receipt: "Nhập kho", issue: "Xuất kho", stocktake: "Kiểm kê & chốt kỳ", ledger: "Sổ kho & báo cáo", catalog: "Danh mục" };

export function LabSuppliesClient({ items, lots, movements, lastClosing, today, canManage }: { items: Item[]; lots: Lot[]; movements: Movement[]; lastClosing: Closing; today: string; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stock");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanNotFound, setScanNotFound] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<VoucherIncoming>(null);
  const [cardReq, setCardReq] = useState<{ id: string | null; key: number }>({ id: null, key: 0 });
  const [catalogSeed, setCatalogSeed] = useState<{ barcode: string; key: number } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lots) m.set(l.item_id, (m.get(l.item_id) || 0) + num(l.balance));
    return m;
  }, [lots]);

  const tabs: Tab[] = canManage ? ["stock", "receipt", "issue", "stocktake", "ledger", "catalog"] : ["stock", "ledger", "catalog"];
  const detailItem = detailId ? itemById.get(detailId) : undefined;
  const voucherTab = tab === "receipt" || tab === "issue";

  function changeTab(next: Tab) {
    setTab(next);
    setToast(null);
  }
  function done(text: string) {
    setToast({ tone: "success", text });
    router.refresh();
  }
  const fail = (text: string) => setToast({ tone: "error", text });
  const clearIncoming = useCallback(() => setIncoming(null), []);

  function toVoucher(kind: "RECEIPT" | "ISSUE", item: Item, mode?: "ISSUE" | "DISPOSAL", quantity?: number) {
    setDetailId(null);
    setToast(null);
    setIncoming({ itemId: item.id, mode, quantity, key: Date.now(), target: kind });
    setTab(kind === "RECEIPT" ? "receipt" : "issue");
  }

  // Mã quét/gõ → vật tư. Hành vi theo màn hình đang mở (xem chú thích đầu file).
  function handleCode(code: string): boolean {
    const found = findItemByScan(items, code);
    if (!found) {
      setScanNotFound(code);
      setScanFeedback(null);
      return false;
    }
    setScanNotFound(null);
    if (canManage && voucherTab) {
      if (tab === "issue" && (totals.get(found.id) || 0) <= 0) {
        setScanFeedback(null);
        setScanNotFound(`${found.code} (hết hàng, không xuất được)`);
        return false;
      }
      setIncoming({ itemId: found.id, key: Date.now(), target: tab === "issue" ? "ISSUE" : "RECEIPT" });
      setScanFeedback(`Đã thêm vào phiếu: ${found.code} — ${found.name}`);
      return true;
    }
    setScanOpen(false);
    setDetailId(found.id);
    return true;
  }

  function onOmniKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const found = findItemByScan(items, search);
    if (!found) return;
    handleCode(search);
    setSearch("");
  }

  return (
    <div className="lab-supplies">
      <div className="ls-omni">
        <div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onOmniKey} placeholder="Tìm hoặc quét mã vật tư (mã, tên, mã vạch)…" aria-label="Tìm hoặc quét mã vật tư" /></div>
        <button type="button" className="button primary ls-scan-btn" onClick={() => { setScanNotFound(null); setScanFeedback(null); setScanOpen(true); }}><Icon name="qr-code" size={18} /> Quét mã</button>
      </div>

      <nav className="ls-tabs" role="tablist" aria-label="Các bước nghiệp vụ kho">
        {tabs.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => changeTab(key)}>{TAB_LABEL[key]}</button>
        ))}
      </nav>

      {toast ? <div className={`alert ${toast.tone}`} role="status">{toast.text}</div> : null}

      {tab === "stock" ? <LabStock items={items} lots={lots} today={today} canManage={canManage} search={search} onOpen={setDetailId} onReceive={(i) => toVoucher("RECEIPT", i)} onIssue={(i) => toVoucher("ISSUE", i)} /> : null}
      {tab === "receipt" && canManage ? <LabVoucher kind="RECEIPT" items={items} lots={lots} movements={movements} today={today} incoming={incoming} onConsumed={clearIncoming} onDone={done} /> : null}
      {tab === "issue" && canManage ? <LabVoucher kind="ISSUE" items={items} lots={lots} movements={movements} today={today} incoming={incoming} onConsumed={clearIncoming} onDone={done} /> : null}
      {tab === "stocktake" && canManage ? <LabStocktake lots={lots} itemById={itemById} today={today} lastClosing={lastClosing} canManage={canManage} onDone={done} onError={fail} /> : null}
      {tab === "ledger" ? <LabLedger movements={movements} items={items} today={today} search={search} cardItemId={cardReq.id} cardKey={cardReq.key} /> : null}
      {tab === "catalog" ? <LabCatalog items={items} canManage={canManage} search={search} seed={catalogSeed} onOpen={setDetailId} onChanged={done} /> : null}

      {detailItem ? (
        <LabItemDetail
          item={detailItem}
          lots={lots}
          today={today}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onReceive={(i) => toVoucher("RECEIPT", i)}
          onIssue={(i, mode, qty) => toVoucher("ISSUE", i, mode, qty)}
          onOpenCard={(i) => { setDetailId(null); setCardReq({ id: i.id, key: Date.now() }); setTab("ledger"); }}
          onChanged={(t) => { done(t); }}
          onError={fail}
        />
      ) : null}

      {scanOpen ? (
        <LabScanDialog
          continuous={canManage && voucherTab}
          feedback={scanFeedback}
          notFound={scanNotFound}
          onCode={(c) => void handleCode(c)}
          onClose={() => { setScanOpen(false); setScanNotFound(null); setScanFeedback(null); }}
          onCreateItem={canManage ? (code) => { setScanOpen(false); setScanNotFound(null); setCatalogSeed({ barcode: code, key: Date.now() }); setTab("catalog"); } : undefined}
        />
      ) : null}

      <style>{`
        .lab-supplies{display:flex;flex-direction:column;gap:14px}
        .lab-supplies .ls-omni{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .lab-supplies .ls-omni .search-box{flex:1 1 320px;width:auto;max-width:640px}
        .lab-supplies .ls-scan-btn{flex:0 0 auto}
        /* Thanh bước nghiệp vụ: nối liền nhau, 1 hàng, cuộn ngang trên điện thoại (không xuống dòng lộn xộn). */
        .lab-supplies .ls-tabs{display:flex;gap:4px;overflow-x:auto;padding:4px;background:#eef2f7;border-radius:12px;-webkit-overflow-scrolling:touch}
        .lab-supplies .ls-tabs button{flex:0 0 auto;border:0;background:transparent;border-radius:9px;padding:9px 16px;font-weight:700;font-size:13px;color:#475569;cursor:pointer;white-space:nowrap}
        .lab-supplies .ls-tabs button.active{background:#fff;color:var(--brand-dark,#172554);box-shadow:0 1px 4px rgba(15,31,54,.14)}
        .lab-supplies .ls-stack{display:flex;flex-direction:column;gap:14px}
        .lab-supplies .ls-voucher{display:flex;flex-direction:column;gap:14px}
        .lab-supplies .ls-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 19px}
        .lab-supplies .ls-bar-end{border-top:1px solid var(--line)}
        .lab-supplies .ls-bar label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;color:#46545a}
        .lab-supplies .ls-bar label.inline-check{flex-direction:row;align-items:center;font-size:12px;font-weight:600}
        .lab-supplies .ls-grow{flex:1 1 140px}
        .lab-supplies .ls-note{padding:0 19px 8px;margin:0}
        .lab-supplies .ls-form-pad{padding:0 19px 19px;display:flex;flex-direction:column;gap:14px}
        .lab-supplies .ls-num{text-align:right;font-variant-numeric:tabular-nums}
        .lab-supplies .ls-guide{border:1px solid #dbe4f0;background:#f8fafc;border-radius:10px;padding:10px 14px;margin:0 0 4px}
        .lab-supplies .ls-guide>summary{cursor:pointer;font-weight:700;font-size:13px;color:#1e3a5f}
        .lab-supplies .ls-guide ol{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.55;color:#334155}
        .lab-supplies .ls-guide li{margin:2px 0}
        .lab-supplies .ls-guide-note{margin:8px 0 0;font-size:12px;color:#92400e}
        .lab-supplies .ls-fefo-warn{flex-basis:100%;font-size:12px;line-height:1.4;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:6px 10px}
        .lab-supplies .ls-stt{width:48px;text-align:center;color:#64748b;font-variant-numeric:tabular-nums}
        .lab-supplies .ls-name-btn{background:none;border:0;padding:0;text-align:left;cursor:pointer;color:inherit}
        .lab-supplies .ls-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
        .lab-supplies .status-badge+.status-badge{margin-left:6px}
        .lab-supplies .ls-count-input{max-width:110px;text-align:right}
        /* Dòng trống nằm trong bảng rộng hơn màn hình (cuộn ngang) không bị cắt chữ ở điện thoại. */
        .lab-supplies td>.empty-state{position:sticky;left:0;box-sizing:border-box;width:min(100%,calc(100vw - 72px))}
        /* Nhóm nút chuyển (Danh sách/Kanban, Xuất dùng/Hủy hàng, Phiếu/Thẻ kho/Báo cáo). */
        .lab-supplies .ls-seg{display:inline-flex;background:#eef2f7;border-radius:10px;padding:3px;gap:2px}
        .lab-supplies .ls-seg button{border:0;background:transparent;border-radius:8px;padding:7px 14px;font-weight:700;font-size:12px;color:#475569;cursor:pointer}
        .lab-supplies .ls-seg button.active{background:#fff;color:var(--brand-dark,#172554);box-shadow:0 1px 3px rgba(15,31,54,.14)}
        /* Menu Xuất Excel (1 nút duy nhất, gom các loại file). */
        .lab-supplies .ls-menu{position:relative}
        .lab-supplies .ls-menu summary{list-style:none;cursor:pointer}
        .lab-supplies .ls-menu summary::-webkit-details-marker{display:none}
        .lab-supplies .ls-menu-list{position:absolute;right:0;top:calc(100% + 6px);z-index:20;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;min-width:270px;display:flex;flex-direction:column}
        .lab-supplies .ls-menu-list a{padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600}
        .lab-supplies .ls-menu-list a:hover{background:#f1f5f9}
        /* Ô đếm tình trạng = bộ lọc của Tồn kho. */
        .lab-supplies .ls-attn{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:16px 19px 4px}
        .lab-supplies .ls-attn-card{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;background:#fff;border:1px solid var(--line);border-left:4px solid #cbd5e1;border-radius:12px;padding:10px 12px;cursor:pointer;min-width:0}
        .lab-supplies .ls-attn-card span{font-size:11px;font-weight:700;color:var(--muted)}
        .lab-supplies .ls-attn-card strong{font-size:22px;line-height:1.1}
        .lab-supplies .ls-attn-card.danger{border-left-color:var(--danger)}.lab-supplies .ls-attn-card.danger strong{color:#b91c1c}
        .lab-supplies .ls-attn-card.warning{border-left-color:var(--warning)}.lab-supplies .ls-attn-card.warning strong{color:#b45309}
        .lab-supplies .ls-attn-card.info{border-left-color:var(--info)}
        .lab-supplies .ls-attn-card.success{border-left-color:var(--success)}
        .lab-supplies .ls-attn-card.active{background:#eff4ff;border-color:#93b4ee;box-shadow:0 0 0 2px rgba(29,78,216,.12)}
        /* Phiếu nhập/xuất. */
        .lab-supplies .ls-head-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .lab-supplies .ls-head-grid label,.lab-supplies .ls-f{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:#46545a;min-width:0}
        .lab-supplies .ls-span-2{grid-column:span 2}.lab-supplies .ls-span-3{grid-column:span 3}
        .lab-supplies .ls-lines{display:flex;flex-direction:column;gap:8px}
        .lab-supplies .ls-lines-head,.lab-supplies .ls-line{display:grid;gap:8px;align-items:start}
        .lab-supplies .ls-lines.receipt .ls-lines-head,.lab-supplies .ls-lines.receipt .ls-line{grid-template-columns:40px minmax(200px,2.4fr) minmax(110px,1fr) 150px 140px 80px}
        .lab-supplies .ls-lines.issue .ls-lines-head,.lab-supplies .ls-lines.issue .ls-line{grid-template-columns:40px minmax(200px,2fr) 150px minmax(260px,3fr) 44px}
        .lab-supplies .ls-lines-head{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:0 2px}
        .lab-supplies .ls-line{padding:6px 2px;border-top:1px solid #eef2f7}
        .lab-supplies .ls-line-no{font-size:12px;font-weight:800;color:var(--muted);text-align:center;padding-top:12px}
        .lab-supplies .ls-f>span{display:none}
        .lab-supplies .ls-qty{position:relative}
        .lab-supplies .ls-qty input{padding-right:46px;text-align:right}
        .lab-supplies .ls-qty em{position:absolute;right:10px;bottom:11px;font-style:normal;font-size:12px;color:var(--muted);pointer-events:none}
        .lab-supplies .ls-alloc{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:40px}
        .lab-supplies .ls-alloc select{flex:1 1 200px;min-height:32px;font-size:12px}
        .lab-supplies .ls-chip{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef2f7;font-size:12px;font-weight:700;color:#334155}
        .lab-supplies .ls-chip.warning{background:var(--warning-soft);color:#8a5a06}
        .lab-supplies .ls-chip.danger{background:var(--danger-soft);color:#9f2727}
        .lab-supplies .ls-line-actions{display:flex;gap:2px;padding-top:4px}
        .lab-supplies .ls-voucher-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:space-between;padding-top:6px;border-top:1px solid var(--line)}
        .lab-supplies .ls-problems{margin:0;padding-left:18px;color:#9f2727;font-size:12px}
        .lab-supplies .ls-adjust{display:flex;flex-direction:column;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px;background:#f8fafc}
        /* Chi tiết vật tư. */
        .lab-supplies .ls-detail-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .lab-supplies .ls-detail-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:12px}
        .lab-supplies .ls-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0}
        .lab-supplies .ls-kpi span{font-size:11px;color:var(--muted);font-weight:700}
        .lab-supplies .ls-kpi strong{font-size:22px}
        .lab-supplies .ls-kpi.warn strong{color:#b45309}
        .lab-supplies .ls-kpi.bad strong{color:#b91c1c}
        .lab-supplies .ls-card{border-top:1px solid var(--line);padding-top:12px}
        .lab-supplies .ls-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
        .lab-supplies .ls-camera video{width:100%;max-height:300px;border-radius:12px;background:#0f172a;object-fit:cover}
        .lab-supplies .ls-scan-manual{display:grid;gap:10px}
        .lab-supplies .ls-import-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .lab-supplies .ls-import-actions input[type=file]{width:auto;min-height:0;border:0;padding:0}
        /* Kanban (cùng dữ liệu với danh sách). */
        .lab-supplies .ls-kanban{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);gap:12px;padding:6px 19px 19px;overflow-x:auto;align-items:start}
        .lab-supplies .ls-kcol{background:#f8fafc;border:1px solid var(--line);border-top:3px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
        .lab-supplies .ls-kcol.danger{border-top-color:var(--danger)}.lab-supplies .ls-kcol.warning{border-top-color:var(--warning)}.lab-supplies .ls-kcol.info{border-top-color:var(--info)}.lab-supplies .ls-kcol.success{border-top-color:var(--success)}
        .lab-supplies .ls-kcol-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .lab-supplies .ls-kcol small{color:var(--muted);font-size:11px}
        .lab-supplies .ls-kcard{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:12px;cursor:pointer;width:100%}
        .lab-supplies .ls-kcard:hover{border-color:#93b4ee;box-shadow:0 2px 8px rgba(29,78,216,.1)}
        .lab-supplies .ls-kcard strong{font-size:13px}
        .lab-supplies .ls-kcard-code{font-size:10px;font-weight:800;color:var(--muted);letter-spacing:.04em}
        .lab-supplies .ls-kempty{color:var(--muted);font-size:12px;text-align:center;padding:12px 0}
        @media(max-width:900px){.lab-supplies .ls-attn{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:760px){
          .lab-supplies .ls-head-grid{grid-template-columns:1fr}.lab-supplies .ls-span-2,.lab-supplies .ls-span-3{grid-column:auto}
          .lab-supplies .ls-lines-head{display:none}
          .lab-supplies .ls-lines.receipt .ls-line,.lab-supplies .ls-lines.issue .ls-line{grid-template-columns:24px minmax(0,1fr) 44px}
          .lab-supplies .ls-line>*:not(.ls-line-no):not(.ls-line-actions){grid-column:2}
          .lab-supplies .ls-line-actions{grid-column:3;grid-row:1}
          .lab-supplies .ls-f>span{display:block;font-weight:700}
          .lab-supplies .ls-qty em{bottom:11px}
          .lab-supplies .ls-detail-kpis{grid-template-columns:1fr}
          .lab-supplies .ls-scan-btn{width:100%}
          .lab-supplies .ls-menu-list{right:auto;left:0}
        }
        @media(max-width:520px){.lab-supplies .ls-attn{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </div>
  );
}
