import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Mọi mục "Cần xử lý" phải mở ĐÚNG danh sách cần làm (không chỉ mở trang), và danh sách chỉ lọc phần hiển thị.
const read = (p: string) => readFileSync(p, "utf8");

describe("Mục Cần xử lý lọc đúng danh sách ở trang đích", () => {
  it("đường dẫn các mục có tham số lọc", () => {
    const bar = read("src/components/nav-group-bar.tsx");
    for (const href of ["/plans?filter=overdue", "/document-publications?filter=stage_overdue", "/document-publications?filter=review_overdue", "/procedure-trainings?status=NOT_PLANNED", "/physician-license?filter=overdue", "/physician-license?filter=soon", "/practitioner-credentials?filter=expiring", "/infection-control?status=NGHI_NGO", "/incoming-documents?filter=overdue", "/incoming-documents?filter=unassigned", "/procurement?filter=bgd", "/procurement?filter=tgd", "/medical-equipment?filter=maintenance"]) {
      expect(bar).toContain(`href: "${href}"`);
    }
    expect(read("src/components/measure-workspace-bar.tsx")).toContain('href: "/monitoring?filter=overdue"');
  });

  it("các danh sách nhận bộ lọc và chỉ lọc phần hiển thị", () => {
    expect(read("src/components/plans-client.tsx")).toContain("overdueOnly = false");
    expect(read("src/components/document-publications-client.tsx")).toContain('attention?: "stage_overdue" | "review_overdue";');
    expect(read("src/components/physician-license-client.tsx")).toContain('attention?: "overdue" | "soon";');
    expect(read("src/components/practitioner-credentials-client.tsx")).toContain("expiringWithinDays?: number");
    expect(read("src/components/infection-control-cases-client.tsx")).toContain("onlyStatus?: string");
    expect(read("src/components/monitoring-client.tsx")).toContain('roundFilter === "OVERDUE"');
    expect(read("src/components/procedure-trainings-client.tsx")).toContain('useState(initialStatusFilter || "ALL")');
    expect(read("src/components/incoming-documents-client.tsx")).toContain('attention?: "overdue" | "unassigned";');
    expect(read("src/components/procurement-requests-client.tsx")).toContain('attention?: "bgd" | "tgd";');
    expect(read("src/components/medical-equipment-client.tsx")).toContain("onlyStatus?: EquipmentStatus");
  });

  it("module một trang chỉ có thanh Cần xử lý (không hiện tab khi nhóm chỉ có 1 trang)", () => {
    expect(read("src/components/workspace-flow-bar.tsx")).toContain("{tabs.length > 1 ? <nav className=\"cw-tabs\"");
    for (const page of ["incoming-documents", "procurement", "medical-equipment"]) expect(read(`src/app/(app)/${page}/page.tsx`)).toContain(`<NavGroupBar group="${page}"`);
  });

  it("Giám sát không còn ô Cần xử lý trùng tổng 4 ô giai đoạn; Kế hoạch có tab Phân tích", () => {
    expect(read("src/app/(app)/monitoring/page.tsx")).not.toContain('label="Cần xử lý" value={needAttention}');
    expect(read("src/app/(app)/plans/page.tsx")).toContain('label: "Phân tích kế hoạch", href: "/plans?tab=analytics"');
  });

  it("giờ cập nhật EMR hiển thị theo múi giờ Việt Nam", () => {
    expect(read("src/components/emr-command-center.tsx")).toContain('toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"');
  });
});
