import QRCode from "qrcode";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

/** Giá trị mã hóa vào tem: mã vạch của vật tư nếu có, không thì mã quản lý — quét lại ra đúng vật tư. */
export function labelValue(item: { code: string; barcode?: string | null }): string {
  return (item.barcode || "").trim() || item.code;
}

/** HTML của tem (QR + mã + tên) — hàm thuần để kiểm thử, in qua cửa sổ mới. */
export function buildLabelHtml(item: { code: string; name: string; unit: string }, value: string, qrDataUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tem ${esc(item.code)}</title><style>
    @page{size:60mm 40mm;margin:2mm}body{margin:0;font-family:Arial,sans-serif}
    .tem{width:56mm;height:36mm;display:flex;gap:2mm;align-items:center;box-sizing:border-box;padding:1mm}
    .tem img{width:28mm;height:28mm;flex:0 0 auto}.tem .t{min-width:0;font-size:9pt;line-height:1.25}
    .tem .c{font-weight:bold;font-size:11pt;word-break:break-all}.tem .n{overflow:hidden;max-height:16mm}.tem .v{color:#444;font-size:7pt;word-break:break-all}
  </style></head><body><div class="tem"><img src="${qrDataUrl}" alt="QR"><div class="t"><div class="c">${esc(item.code)}</div><div class="n">${esc(item.name)}</div><div class="v">${esc(item.unit)} · ${esc(value)}</div></div></div></body></html>`;
}

export async function printItemLabel(item: { code: string; name: string; unit: string; barcode?: string | null }): Promise<void> {
  const value = labelValue(item);
  const qr = await QRCode.toDataURL(value, { margin: 1, width: 240 });
  const w = window.open("", "_blank", "width=480,height=360");
  if (!w) throw new Error("Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên cho trang này rồi thử lại.");
  w.document.write(buildLabelHtml(item, value, qr));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

type CardPrintRow = { movement_date: string; movement_type: string; quantity_delta: number | string; reference_no: string | null; counterparty: string | null; lot: { lot_number: string } | null; balance: number };

/** HTML thẻ kho để in (A4) — hàm thuần để kiểm thử. */
export function buildCardPrintHtml(item: { code: string; name: string; unit: string; barcode?: string | null }, rows: CardPrintRow[], typeLabel: (t: string) => string): string {
  const body = rows
    .map((r) => {
      const d = Number(r.quantity_delta);
      return `<tr><td>${esc(r.movement_date)}</td><td>${esc(typeLabel(r.movement_type))}</td><td>${esc(r.lot?.lot_number || "")}</td><td class="n">${d > 0 ? esc(d) : ""}</td><td class="n">${d < 0 ? esc(Math.abs(d)) : ""}</td><td class="n"><b>${esc(r.balance)}</b></td><td>${esc([r.reference_no, r.counterparty].filter(Boolean).join(" · "))}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Thẻ kho ${esc(item.code)}</title><style>
    @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;font-size:10pt}h1{font-size:14pt;margin:0 0 4px}.m{color:#444;margin-bottom:10px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:4px 6px;vertical-align:top}th{background:#eee}.n{text-align:right}
  </style></head><body><h1>THẺ KHO</h1><div class="m">${esc(item.code)} — ${esc(item.name)} · ĐVT: ${esc(item.unit)}${item.barcode ? ` · Mã vạch: ${esc(item.barcode)}` : ""}</div>
  <table><thead><tr><th>Ngày</th><th>Loại</th><th>Lô</th><th>Nhập</th><th>Xuất</th><th>Tồn</th><th>Số phiếu / người nhận</th></tr></thead><tbody>${body || '<tr><td colspan="7">Chưa có phiếu nào.</td></tr>'}</tbody></table></body></html>`;
}

export function printItemCard(item: { code: string; name: string; unit: string; barcode?: string | null }, rows: CardPrintRow[]): void {
  const labels: Record<string, string> = { RECEIPT: "Nhập kho", ISSUE: "Xuất dùng", DISPOSAL: "Hủy hàng", ADJUST: "Điều chỉnh" };
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên cho trang này rồi thử lại.");
  w.document.write(buildCardPrintHtml(item, rows, (t) => labels[t] || t));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
