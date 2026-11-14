import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// KpiCard: component dùng chung cho mọi trang thay vì mỗi trang tự chép tay
// JSX "<article className=kpi-card>" (23 file đã làm vậy, 2 tên class khác
// nhau kpi-card/kpi) — bắt đầu từ component mới, tránh đụng 23 file hiện có
// nên dùng class mới ".kpi-tile", không tái dùng ".kpi-card"/".kpi".
describe("KpiCard (src/components/kpi-card.tsx): component chung cho KPI, dùng class mới .kpi-tile", () => {
  const source = read("src/components/kpi-card.tsx");

  it("export KpiCard với đúng props: icon, tone, label, value, trend, visual, caption, urgent, footer, href", () => {
    expect(source).toContain("export function KpiCard({");
    expect(source).toContain("icon, tone = \"blue\", label, value, trend, visual, caption, urgent, footer, href,");
  });

  it("caption là slot tuỳ chọn (vd '12/20 Action'), chỉ render khi có — dùng cho các trang có dòng phụ dưới giá trị (improvement/projects...)", () => {
    expect(source).toContain("{caption ? <div className=\"kpi-tile-caption\">{caption}</div> : null}");
  });

  it("layout theo tham khảo Oryvia: icon+title ở header, giá trị+visual nằm NGANG cùng hàng (.kpi-tile-main), trend ở cuối card — không còn visual xếp dưới giá trị như bản đầu", () => {
    expect(source).toContain('<span className="kpi-tile-label">{label}</span>');
    expect(source).toContain('<div className="kpi-tile-main">\n      <div className="kpi-tile-value">{value}</div>\n      {visual ? <div className="kpi-tile-visual">{visual}</div> : null}\n    </div>');
  });

  it("urgent (tuỳ chọn) thêm class 'urgent' lên kpi-tile — thay cho quy ước <article className={`kpi ${overdue?\"danger\":\"\"}`}> ở các trang cũ (capa/page.tsx...), gộp 2 biến thể danger/warning cũ thành 1 tông nhấn chung", () => {
    expect(source).toContain('const className = `kpi-tile${urgent ? " urgent" : ""}`;');
  });

  it("render class gốc 'kpi-tile' (KHÔNG tái dùng kpi-card/kpi của 23 file cũ, tránh đụng CSS trang khác)", () => {
    expect(source).toContain('`kpi-tile${urgent');
    expect(source).not.toContain('className="kpi-card"');
  });

  it("icon dùng className=\"kpi-icon <tone>\" đúng quy ước đã có (kpi-icon-tone-coverage.test.ts áp dụng cho cả file này)", () => {
    expect(source).toContain('className={`kpi-icon ${tone}`}');
  });

  it("trend dùng className=\"kpi-trend <tone>\" với mũi tên lên/xuống, tắt được qua arrow:false khi down/up chỉ tô màu 1 badge đếm số chứ không phải trend thật (vd 'Việc của tôi' sau)", () => {
    expect(source).toContain('className={`kpi-trend ${trend.tone}`}');
    expect(source).toContain('trend.tone === "up" ? "▲ " : trend.tone === "down" ? "▼ " : ""');
    expect(source).toContain("const showArrow = trend?.arrow !== false;");
  });

  it("footer (tuỳ chọn) là link nhỏ góc phải header, cạnh title (vd 'Xem tất cả →', đúng vị trí tham khảo Oryvia) — KHÁC với href bọc cả card, dùng khi chỉ 1 phần nhỏ của card cần bấm được", () => {
    expect(source).toContain('{footer ? <Link className="kpi-tile-foot" href={footer.href}>{footer.text}</Link> : null}');
  });

  it("visual là slot tuỳ chọn (TqmGauge/TqmDonut...), chỉ render khi có", () => {
    expect(source).toContain("{visual ? <div className=\"kpi-tile-visual\">{visual}</div> : null}");
  });

  it("có href thì bọc trong Link (card bấm được), không có thì render <article> tĩnh", () => {
    expect(source).toContain("import Link from \"next/link\";");
    expect(source).toContain("href\n    ? <Link href={href} className={`${className} kpi-tile-link`}>{body}</Link>\n    : <article className={className}>{body}</article>;");
  });

  it("globals.css định nghĩa .kpi-tile-top/.kpi-tile-value/.kpi-tile-visual/.kpi-tile-caption/.kpi-tile.urgent 1 lần duy nhất", () => {
    const css = read("src/app/globals.css");
    for (const cls of [".kpi-tile-top{", ".kpi-tile-value{", ".kpi-tile-visual{", ".kpi-tile-caption{", ".kpi-tile.urgent{", ".kpi-tile-foot{"]) {
      expect(css.split(cls).length - 1, `${cls} should appear exactly once`).toBe(1);
    }
  });

  it(".kpi-tile{ và .kpi-tile-label{ xuất hiện đúng 2 lần: định nghĩa gốc + 1 lần thu gọn trong @media(max-width:620px) (giống quy ước .kpi-grid đã có sẵn trong file này) — không phải định nghĩa trùng lặp kiểu token-war. Mobile override của .kpi-tile-label cho nhãn tự xuống dòng (white-space:normal) thay vì cắt chữ bằng dấu ba chấm trong lưới 2 cột hẹp (phát hiện từ ảnh chụp production thật).", () => {
    const css = read("src/app/globals.css");
    expect(css.split(".kpi-tile{").length - 1).toBe(2);
    expect(css.split(".kpi-tile-label{").length - 1).toBe(2);
    expect(css).toContain(".kpi-tile-label{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25}");
    expect(css).toContain("@media(max-width:620px)");
    expect(css).toContain(".kpi-tile{min-height:104px;padding:14px}");
  });
});
