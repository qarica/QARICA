import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Rà soát toàn app sau sự cố TTBYT (medical_equipment.page.tsx select cột
// is_active đã xoá) — viết công cụ đối chiếu MỌI .from(table).select()/
// .insert()/.update() trong src với schema Supabase sống thật (qua
// information_schema). Phát hiện 1 lỗi khác hẳn module TTBYT: safety_alerts
// không có cột updated_at (bảng này không theo dõi thời điểm sửa đổi), nhưng
// route lưu nháp cảnh báo an toàn vẫn update({...,updated_at:now}) — mọi lần
// lưu nháp đều lỗi "column updated_at does not exist" (lỗi ồn, không âm thầm
// như vụ TTBYT, nhưng vẫn là cùng gốc rễ: code không khớp schema thật).
describe("safety-alerts content route: update() không còn gửi cột updated_at (bảng safety_alerts không có cột này)", () => {
  it("không còn update({...newValue, updated_at: now})", () => {
    const route = read("src/app/api/safety-alerts/[id]/content/route.ts");
    expect(route).not.toContain("updated_at: now");
    expect(route).not.toContain("const now = new Date().toISOString();");
  });

  it("update() chỉ gửi newValue (summary/lesson/recommendation/expires_at)", () => {
    const route = read("src/app/api/safety-alerts/[id]/content/route.ts");
    expect(route).toContain('.from("safety_alerts").update(newValue).eq("id", ctx.alert.id);');
  });
});
