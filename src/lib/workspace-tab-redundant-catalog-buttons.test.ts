import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORKSPACES } from "./workspace-navigation";

// Regression for 2 explicit reports asking to declutter the top workspace
// tab strip by removing a tab that duplicates a button already on its
// sibling page:
// - "Dời danh mục chỉ số vào nút quản lý chỉ số" — Đo lường & Giám sát's
//   "Danh mục chỉ số" tab pointed at the same /indicators/catalog page the
//   "Quản lý chỉ số" button on /indicators already linked to (that button
//   used to point at the older, now-unlinked /indicators/manage page
//   instead — repointed to /indicators/catalog so nothing is lost).
// - "Dời nút bộ tiêu chí vào nút quản lý bộ tiêu chí" — Đánh giá & Tiếp
//   đoàn's "Bộ tiêu chí" tab pointed at the exact same /assessments/catalog
//   href the "Quản lý bộ tiêu chí" button on /assessments already used.
describe("Workspace tabs don't duplicate a 'Quản lý ...' button already on a sibling page", () => {
  it("Đo lường & Giám sát workspace no longer has a separate 'Danh mục chỉ số' tab", () => {
    const indicators = WORKSPACES.find((w) => w.root === "/indicators");
    expect(indicators?.tabs.some((t) => t.label === "Danh mục chỉ số")).toBe(false);
    expect(indicators?.tabs.map((t) => t.label)).toEqual(["Chỉ số chất lượng", "Giám sát & Bảng kiểm"]);
  });

  it("/indicators' 'Quản lý chỉ số' button now points at /indicators/catalog (the page the removed tab used to reach), not the older /indicators/manage page", () => {
    const page = readFileSync("src/app/(app)/indicators/page.tsx", "utf8");
    expect(page).toContain('<Link className="button secondary" href="/indicators/catalog">Quản lý chỉ số</Link>');
  });

  it("Đánh giá & Tiếp đoàn workspace no longer has a separate 'Bộ tiêu chí' tab", () => {
    const assessments = WORKSPACES.find((w) => w.root === "/assessments");
    expect(assessments?.tabs.some((t) => t.label === "Bộ tiêu chí")).toBe(false);
    expect(assessments?.tabs.map((t) => t.label)).toEqual(["Tự đánh giá", "Đánh giá ngoài", "Audit / Tracer", "Tiếp đoàn"]);
  });

  it("/assessments already has a 'Quản lý bộ tiêu chí' button pointing at the same /assessments/catalog href the removed tab used", () => {
    const page = readFileSync("src/app/(app)/assessments/page.tsx", "utf8");
    expect(page).toContain('tabs: [{label:"Quản lý bộ tiêu chí",href:"/assessments/catalog"}]');
  });
});
