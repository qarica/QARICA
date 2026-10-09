import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/emr/dashboard/route.ts", "utf8");

// Báo cáo thực tế: "Đã đưa về nháp nhưng Tổng quan emr chưa đồng bộ" — sau khi
// reset toàn bộ Biểu mẫu về publish_status=DRAFT (xem migration
// 20261102_emr_bieu_mau_reset_to_draft_v1.sql), trang Tổng quan EMR
// (/api/emr/dashboard, emr-command-center.tsx) vẫn đếm các hạng mục Nháp này
// y như đã duyệt — vì route dashboard chưa từng lọc theo publish_status,
// trong khi trang chi tiết Biểu mẫu (kpiItems ở emr-category-client.tsx) đã
// loại từ trước. Một nghiệp vụ chỉ có một nguồn sự thật: lọc ngay ở điểm lấy
// dữ liệu duy nhất của route này để mọi KPI/categories/departmentMatrix/
// escalation/upcoming/controlCoverage phía dưới tự động đồng nhất.
describe("EMR Tổng quan — loại Biểu mẫu Nháp khỏi mọi thống kê dashboard", () => {
  it("select lấy publish_status và lọc BIEU_MAU+DRAFT ngay tại allItems (nguồn duy nhất, không lọc rải rác từng chỗ dùng)", () => {
    expect(route).toContain('.select("id,category,title,description,status,department_ids,owner_department_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,publish_status,created_at,updated_at")');
    expect(route).toContain('const allItems = (data ?? []).filter((x) => !(x.category === "BIEU_MAU" && x.publish_status === "DRAFT"));');
  });

  it("bộ lọc đứng TRƯỚC bộ lọc ngày (date filter) nên không phá vỡ hành vi lọc ngày đã có", () => {
    const allItemsIdx = route.indexOf("const allItems =");
    const dateFilterIdx = route.indexOf("const items = dateFilterActive");
    expect(allItemsIdx).toBeGreaterThan(-1);
    expect(dateFilterIdx).toBeGreaterThan(allItemsIdx);
  });
});
