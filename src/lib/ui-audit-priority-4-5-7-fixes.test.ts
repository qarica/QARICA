import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Audit giao diện QARICA — ưu tiên #4: input chính dùng placeholder-only,
// không có label cố định (nhãn biến mất khi gõ xong, bất lợi cho screen
// reader). /incoming-documents đã có sẵn quy ước <label className=
// "doc-task-field"><span>...</span><input/></label> cho các field cạnh đó
// (Ngày đến, Hạn xử lý) — áp đúng quy ước có sẵn thay vì tự chế mới.
// /document-publications và /procurement không có quy ước label-wrap, chỉ
// có aria-label cho search box — dùng aria-label cho các field đã nêu,
// nhất quán với search box cùng file, không đổi layout.
describe("Ưu tiên #4: input chính có nhãn (label cố định hoặc aria-label), không còn placeholder-only", () => {
  it("incoming-documents-client.tsx: 'Trích yếu nội dung', 'Cơ quan ban hành', 'Số văn bản' đều bọc trong <label className=\"doc-task-field\"> giống Ngày đến/Hạn xử lý cạnh đó", () => {
    const src = read("src/components/incoming-documents-client.tsx");
    expect(src).toContain('<span>Trích yếu nội dung</span>');
    expect(src).toContain('<span>Cơ quan ban hành</span>');
    expect(src).toContain('<span>Số văn bản (tùy chọn)</span>');
  });

  it("document-publications-client.tsx: mọi input placeholder 'Mã văn bản...'/'Tên văn bản...' đều có aria-label", () => {
    const src = read("src/components/document-publications-client.tsx");
    const lines = src.split("\n").filter((l) => /placeholder="(Mã văn bản|Tên văn bản)/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/aria-label="(Mã văn bản|Tên văn bản)"/);
  });

  it("procurement-requests-client.tsx: Tên đề xuất/Số lượng/Đơn giá/Chi phí dự kiến đều có aria-label", () => {
    const src = read("src/components/procurement-requests-client.tsx");
    expect(src).toContain('aria-label="Tên đề xuất"');
    expect(src).toContain('aria-label="Số lượng"');
    expect(src).toContain('aria-label="Đơn giá — VNĐ"');
    expect(src).toContain('aria-label="Chi phí dự kiến"');
  });
});

// Ưu tiên #5: TqmHorizontalBars (component biểu đồ dùng chung) thiếu
// empty-state, khác TqmDonut cùng file — sửa 1 lần lợi cho mọi trang đang
// dùng. Thêm biểu đồ cho bảng "Lỗi theo khoa/phòng" ở /hsba-audit/report
// (trước đây chỉ có bảng số thô).
describe("Ưu tiên #5: TqmHorizontalBars có empty-state; /hsba-audit/report có biểu đồ cho bảng Lỗi theo khoa/phòng", () => {
  it("TqmHorizontalBars trả về .empty-state.compact khi rows rỗng, giống quy ước empty-state dùng chung toàn app", () => {
    const src = read("src/components/tqm-charts.tsx");
    expect(src).toContain('if(!rows.length) return <div className="empty-state compact">Chưa có dữ liệu.</div>;');
  });

  it("hsba-audit/report/page.tsx dùng TqmHorizontalBars cho bảng Lỗi theo khoa/phòng", () => {
    const src = read("src/app/(app)/hsba-audit/report/page.tsx");
    expect(src).toContain('import { TQM_CHART_CSS, TqmHorizontalBars } from "@/components/tqm-charts"');
    expect(src).toContain("<TqmHorizontalBars");
  });
});

// Ưu tiên #7 (lặt vặt): trước đây trang này có một .kpi-tile RIÊNG của
// chính nó (page-local) làm mất tông màu danger/warning/success theo ngữ
// nghĩa — fix lúc đó là quay về .kpi-card chung của app (còn giữ tông màu).
// 2026-11-13: app giờ có component KpiCard dùng chung thật sự
// (src/components/kpi-card.tsx, class .kpi-tile — trùng tên với
// page-local cũ đã bị xoá, không phải cùng CSS) cho MỌI trang, bản thân nó
// giữ đúng tông màu qua prop `tone` — nên ý định gốc của test này (không
// được mất tông màu ngữ nghĩa) vẫn đúng, chỉ đổi cách diễn đạt.
describe("Ưu tiên #7 (lặt vặt): KpiCard dùng chung giữ đúng tông màu ngữ nghĩa, status-badge nhất quán, tương phản đủ chuẩn, không báo động giả khi chưa có dữ liệu", () => {
  it("hsba-audit/report/page.tsx dùng KpiCard dùng chung (tone=\"green\"/\"red\") thay vì .kpi-card cục bộ cũ", () => {
    const src = read("src/app/(app)/hsba-audit/report/page.tsx");
    expect(src).toContain('import { KpiCard } from "@/components/kpi-card";');
    expect(src).toContain('<section className="kpi-grid"');
    expect(src).toContain('<KpiCard icon="badge-check" tone="green" label="Đạt" value={passCount} />');
    expect(src).toContain('<KpiCard icon="circle-alert" tone="red" label="Chưa đạt" value={failCount} />');
    expect(src).not.toContain('className="kpi-card');
  });

  it("admin/permissions/page.tsx: cột Trạng thái của bảng 'Vai trò và số quyền mặc định' bọc trong status-badge, nhất quán với các bảng trạng thái khác cùng trang", () => {
    const src = read("src/app/(app)/admin/permissions/page.tsx");
    expect(src).toContain('<span className={`status-badge ${role.is_active ? "success" : "muted"}`}>');
  });

  it("globals.css: .status-badge.muted đủ tương phản WCAG AA (~5.46:1, trước là ~4.19:1 dưới ngưỡng 4.5:1 cho chữ nhỏ)", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".status-badge.muted{background:#eef1f2;color:#56636b}");
    expect(css).not.toContain(".status-badge.muted{background:#eef1f2;color:#68757b}");
  });

  it("hand-hygiene-audits-client.tsx: KPI 'Tỷ lệ tuân thủ chung' hiện 'Chưa có dữ liệu' (tông trung tính) thay vì '0%' tô đỏ khi overall.observed = 0 (chưa có đợt giám sát nào, không phải tuân thủ 0% thật)", () => {
    const src = read("src/components/hand-hygiene-audits-client.tsx");
    expect(src).toContain('overall.observed ? `compliance-${complianceTone(overall.rate)}` : "compliance-muted"');
    expect(src).toContain('overall.observed ? `${overall.rate}%` : "Chưa có dữ liệu"');
    expect(src).toContain(".compliance-muted{color:var(--muted)");
  });
});
