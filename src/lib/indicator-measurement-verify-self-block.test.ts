import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Tự rà theo đúng lớp lỗi "4 mắt" đã sửa cho EMR go-live gate (tách quyền
// verify, chặn tự xác minh), CAPA (chặn tự phê duyệt), và Action cá nhân
// (20261026_action_verify_self_block_v1.sql) — chỉ số chất lượng đã tách
// riêng indicators.enter/indicators.verify đúng ý định "người xác minh
// phải khác người nhập", nhưng nhánh VERIFY của
// qlcl_indicator_measurement_transition_v1 chưa từng kiểm tra actor khác
// entered_by: một người có cả 2 quyền (vd indicators.manage) tự nhập kỳ đo
// rồi tự xác minh ngay dữ liệu của chính mình, không ai đối chiếu.
describe("Chỉ số chất lượng — VERIFY chặn tự xác minh kỳ đo do chính mình nhập/gửi", () => {
  const migration = read("supabase/migrations/20261103_indicator_measurement_verify_self_block_v1.sql");

  it("nhánh VERIFY kiểm tra entered_by khác actor trước khi cho xác minh", () => {
    expect(migration).toContain("elsif v_action='VERIFY' then");
    expect(migration).toContain("if v_measurement.entered_by is not null and v_measurement.entered_by = p_actor_user_id then");
    expect(migration).toContain("raise exception 'Người xác minh phải khác người đã nhập/gửi kỳ đo này — không thể tự xác minh dữ liệu do chính mình nhập';");
  });

  it("vẫn giữ nguyên các điều kiện VERIFY cũ (chỉ SUBMITTED, phải có calculated_value)", () => {
    expect(migration).toContain("if v_old_status <> 'SUBMITTED' then\n      raise exception 'Only SUBMITTED measurements may be verified';");
    expect(migration).toContain("if v_measurement.calculated_value is null then\n      raise exception 'Calculated indicator value is required before verification';");
  });

  it("route gọi RPC này cho action VERIFY với quyền indicators.verify riêng biệt", () => {
    const route = read("src/app/api/indicators/measurements/[id]/workflow/route.ts");
    expect(route).toContain('const WORKFLOW_RPC = "qlcl_indicator_measurement_transition_v1";');
    expect(route).toContain('const permission = command === "SAVE" || command === "SUBMIT" ? "indicators.enter" : "indicators.verify";');
  });
});
