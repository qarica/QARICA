import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Các nhóm menu nhiều trang ngoài QLCL dùng chung thanh luồng việc: tab lấy đúng từ sidebar (một nguồn, cùng quyền) + Cần xử lý.
const read = (p: string) => readFileSync(p, "utf8");

describe("NavGroupBar cho Điều hành, Văn bản, Hành nghề, Kiểm soát nhiễm khuẩn", () => {
  it("tab lấy từ visibleNavGroups (không khai báo lại danh sách trang), bỏ Tổng quan QLCL khỏi nhóm Điều hành", () => {
    const bar = read("src/components/nav-group-bar.tsx");
    expect(bar).toContain("visibleNavGroups(user).find((g) => g.id === group)");
    expect(bar).toContain('c.href.split("?")[0] !== "/dashboard"');
    expect(bar).toContain("<WorkspaceFlowBar ");
  });

  it("gắn vào đủ các trang của 4 nhóm", () => {
    for (const [page, group] of [["plans", "operations"], ["calendar", "operations"], ["directives", "operations"], ["reports", "operations"], ["physician-license", "physician-license"], ["practitioner-credentials", "physician-license"], ["document-publications", "document-publications"], ["infection-control", "infection-control"], ["infection-control/hand-hygiene", "infection-control"]]) {
      expect(read(`src/app/(app)/${page}/page.tsx`)).toContain(`<NavGroupBar group="${group}"`);
    }
    expect(read("src/components/procedure-trainings-page.tsx")).toContain('<NavGroupBar group="document-publications" active={mode === "self_read" ? "/tu-doc-hieu" : "/procedure-trainings"}');
  });

  it("nghĩa vụ báo cáo quá hạn lọc đúng danh sách ở /reports", () => {
    expect(read("src/components/nav-group-bar.tsx")).toContain('href: "/reports?attention=overdue"');
    expect(read("src/app/(app)/reports/page.tsx")).toContain('label: "Nghĩa vụ báo cáo quá hạn"');
  });
});
