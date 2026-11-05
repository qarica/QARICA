import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu tường minh: tham khảo portal ứng dụng của Tâm Anh Hospital (lưới ô
// vuông theo nhóm, icon + tên + mô tả ngắn) để thiết kế lại "trang chủ" dạng
// danh mục module — nhưng KHÔNG thay thế /dashboard (trang đó là KPI/biểu đồ
// QLCL thật, có dữ liệu nghiệp vụ và rất nhiều test riêng: dashboard-kpi,
// dashboard-domain-scope...). /modules là trang MỚI, tái dùng visibleNavGroups
// đã lọc đúng quyền cho sidebar — không viết lại logic lọc quyền hiển thị
// module ở một nơi thứ hai.
describe("Trang /modules — danh mục module dạng lưới (không đụng /dashboard)", () => {
  it("page.tsx tái dùng visibleNavGroups (cùng nguồn lọc quyền với sidebar), không tự viết lại logic lọc", () => {
    const page = read("src/app/(app)/modules/page.tsx");
    expect(page).toContain('import { visibleNavGroups } from "@/lib/navigation";');
    expect(page).toContain("const groups = visibleNavGroups(user);");
    expect(page).toContain("<ModuleCatalogClient groups={groups} />");
  });

  it("không đụng tới /dashboard/page.tsx (KPI QLCL thật, không phải danh mục module)", () => {
    const dashboard = read("src/app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain("buildIndicatorKpi");
    expect(dashboard).not.toContain("ModuleCatalogClient");
  });

  it("module-catalog-client.tsx: lưới ô vuông theo nhóm, mỗi ô là Link tới đúng href/icon của NavItem, có ô tìm kiếm lọc theo tên", () => {
    const client = read("src/components/module-catalog-client.tsx");
    expect(client).toContain('<Link href={c.href} className="module-catalog-tile"');
    expect(client).toContain("<Icon name={c.icon} size={18} />");
    expect(client).toContain('<div className="search-box module-catalog-search">');
    expect(client).toContain("g.children.filter((c) => c.label.toLowerCase().includes(q))");
  });

  it("mô tả module (MODULE_DESCRIPTIONS) tái dùng description có sẵn của EMR_CATEGORIES, không chép tay trùng lặp lệch sau này", () => {
    const catalog = read("src/lib/module-catalog.ts");
    expect(catalog).toContain('import { EMR_CATEGORIES } from "@/lib/emr-categories";');
    expect(catalog).toContain("...Object.fromEntries(EMR_CATEGORIES.map((c) => [c.label, c.description]))");
  });

  it("topbar có nút Danh mục module, không điều kiện theo quyền riêng (giống Sổ tay cá nhân — nội dung trang tự lọc quyền qua visibleNavGroups)", () => {
    const shell = read("src/components/app-shell.tsx");
    expect(shell).toContain('<Link href="/modules" prefetch={true} className="icon-button header-icon modules-launcher" onClick={() => startNavigation("/modules")} title="Danh mục module" aria-label="Danh mục module"><Icon name="layers" size={18} /></Link>');
  });
});
