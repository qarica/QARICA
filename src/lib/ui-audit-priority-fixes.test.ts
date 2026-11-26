import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Audit giao diện QARICA (Claude Docs, phiên 2026-11-12): fix ưu tiên #1
// (≥11 bảng chưa xử lý mobile) + #3 (2 lỗi component dùng chung toàn cục).
//
// Phát hiện quan trọng khi verify bằng Playwright: thêm `data-label` +
// `table{display:block;min-width:0;width:100%}` KHÔNG đủ — toàn bộ app có
// sẵn `.workspace-app .panel .table-wrap > table{width:max-content;
// min-width:100%}` trong final-visual-lock.css (3 class, @media(760px)),
// đặc hiệu hơn mọi override 2-class không !important, khiến bảng vẫn tràn
// ngang dù data-label/display:grid đã đúng. Tương tự `.workspace-app
// .table-wrap{background:#fff!important}` (2 chỗ) đè mất scroll-shadow
// không !important, và `.workspace-app .content{padding:...!important}`
// (~10 breakpoint khác nhau) đè mất padding-bottom không !important. Quy
// ước đã có sẵn trong chính final-visual-lock.css (.incoming-doc-overview,
// .physician-license-overview) là luôn thêm `!important` cho mọi rule
// card-conversion — các test dưới đây khóa đúng quy ước đó cho các bảng
// mới sửa, để không lặp lại lỗi "trông như đã sửa nhưng CSS không thắng".
describe("Audit giao diện QARICA — ưu tiên #1: bảng mobile dùng !important đúng quy ước", () => {
  const targets = [
    { file: "src/app/(app)/cancelled-records/page.tsx", cls: "cancelled-records-page" },
    { file: "src/components/indicator-catalog-client.tsx", cls: "indicator-catalog-panel" },
    { file: "src/components/criteria-catalog-client.tsx", cls: "criteria-catalog-panel" },
    { file: "src/app/(app)/risks/page.tsx", cls: "risk-table" },
    { file: "src/app/(app)/capa/page.tsx", cls: "capa-table" },
    { file: "src/app/(app)/evidence/page.tsx", cls: "evidence-table" },
    { file: "src/components/practitioner-credentials-client.tsx", cls: "practitioner-credentials-panel" },
    { file: "src/components/medical-equipment-client.tsx", cls: "medical-equipment-panel" },
    { file: "src/components/admin-users-client.tsx", cls: "admin-users-panel" },
  ];

  for (const { file, cls } of targets) {
    it(`${file}: table/thead/tbody/tr/td ở .${cls} đều !important (thắng được .workspace-app .panel .table-wrap > table{width:max-content} có sẵn)`, () => {
      const src = read(file);
      expect(src).toContain(`.${cls} .table-wrap{overflow:visible!important}`);
      expect(src).toContain(`.${cls} .table-wrap table{display:block!important;min-width:0!important;width:100%!important}`);
      expect(src).toContain(`.${cls} .table-wrap thead{display:none!important}`);
      expect(src).toContain(`.${cls} .table-wrap tbody{display:grid!important`);
      expect(src).toContain(`.${cls} .table-wrap tbody tr{display:grid!important;grid-template-columns:minmax(0,1fr)!important`);
      expect(src).toContain(`.${cls} .table-wrap tbody td{display:grid!important`);
      expect(src).toContain("min-width:0!important;width:100%!important;padding:9px 0!important;border:0!important;border-bottom:1px solid #edf1f5!important");
      expect(src).toContain(`.${cls} .table-wrap tbody td:last-child{border-bottom:0!important}`);
      expect(src).toContain(`.${cls} .table-wrap tbody td[data-label]::before{content:attr(data-label)`);
    });
  }

  it("practitioner-credentials-client.tsx: cả 19 cột gốc đều có data-label (không ẩn cột nào — đúng chủ ý thiết kế mirror sheet Excel INPUT đã ghi trong comment gốc)", () => {
    const src = read("src/components/practitioner-credentials-client.tsx");
    const labels = ["Họ và tên", "Giới tính", "CCCD", "SĐT / Email", "Khoa", "Loại hồ sơ / Số", "Ngày cấp / Nơi cấp", "Chức danh", "Phạm vi hành nghề", "Phạm vi bổ sung/điều chỉnh", "Văn bằng chuyên môn", "Văn bằng chuyên khoa", "Chứng chỉ", "Kỹ thuật đề xuất", "Ngày ĐK HN", "Quyết định phân công", "Tình trạng hành nghề", "Hạn GPHN/CME", "Ghi chú"];
    for (const label of labels) expect(src).toContain(`data-label="${label}"`);
  });

  it("RegistryModuleWorkspace (dùng chung cho /directives và /reports) KHÔNG bị sửa — đã verify bằng Playwright là đã có sẵn .registry-desktop/.registry-mobile dual-render qua module-modern.css, không phải false negative của audit fork", () => {
    const src = read("src/components/registry-module-workspace.tsx");
    expect(src).toContain("registry-desktop");
    expect(src).toContain("registry-mobile");
    const css = read("src/app/module-modern.css");
    expect(css).toContain(".registry-desktop{display:none!important}.registry-mobile{display:grid");
  });

  it("Risk Heatmap (/risks) và ma trận phân quyền (/admin/permissions) không phải <table> nên dùng kỹ thuật scroll-shadow (CSS 2 lớp gradient) thay vì data-label — cả 2 nơi đều cần !important để thắng .workspace-app .table-wrap{background:#fff!important} có sẵn", () => {
    const risksSrc = read("src/app/(app)/risks/page.tsx");
    expect(risksSrc).toContain(".risk-heatmap{background:linear-gradient");
    expect(risksSrc).toContain("background-attachment:local,local,scroll,scroll}");
    const permSrc = read("src/components/admin-role-permissions-client.tsx");
    expect(permSrc).toContain(".workspace-app .panel .admin-role-permissions-scroll{");
    expect(permSrc).toContain("!important");
    expect(permSrc).toContain("background-attachment:local,local,scroll,scroll !important");
  });
});

describe("Audit giao diện QARICA — ưu tiên #3: 2 lỗi component dùng chung toàn cục", () => {
  it("toolbar .search-box không còn bị bóp cao ~190px dưới 620px (flex-basis:190px từ layout ROW áp nhầm lên chiều cao khi .toolbar chuyển flex-direction:column)", () => {
    const css = read("src/app/final-visual-lock.css");
    expect(css).toContain(".workspace-app .toolbar .search-box{flex:1 1 190px;min-width:0;max-width:100%;}");
    expect(css).toContain('.workspace-app .toolbar .search-box,\n .workspace-app .toolbar-left .search-box{flex:1 1 auto;}');
  });

  it("FAB Quick Capture (global-quick-capture.tsx, position:fixed góc dưới-phải) không còn che nội dung cuối trang trên mobile — .content có padding-bottom dự phòng, đặt ở final-visual-lock.css (nạp sau cùng) để thắng ~10 rule !important khác đang tranh chấp padding của .workspace-app .content qua nhiều breakpoint", () => {
    const css = read("src/app/final-visual-lock.css");
    expect(css).toContain(".workspace-app .content{padding-bottom:calc(76px + env(safe-area-inset-bottom))!important}");
  });

  it("global-quick-capture.tsx: FAB cao 52px + bottom:14px ở mobile — 76px dự phòng đủ che phủ (52+14+safety)", () => {
    const src = read("src/components/global-quick-capture.tsx");
    expect(src).toContain("@media(max-width:640px){.global-quick-capture{right:14px;bottom:14px}.global-quick-capture .gqc-fab{width:52px;height:52px}}");
  });
});
