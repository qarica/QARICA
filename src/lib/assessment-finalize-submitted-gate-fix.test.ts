import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện khi tiếp tục áp lớp lỗi "UI↔API↔DB không nhất quán" sang luồng
// Tự đánh giá: nút "Chốt kết quả đợt đánh giá" (FINALIZE,
// assessment-workflow-client.tsx) không bao giờ bấm thành công được.
//
// qlcl_save_criterion_assessment_v1 (20260924163500) chỉ từng ghi
// workflow_status 'DRAFT' hoặc 'SUBMITTED' cho criterion_assessments —
// không RPC nào trong hệ thống từng đặt 'REVIEWED'/'COMPLETED'/'APPROVED'.
// qlcl_transition_assessment_round_v1 (SUBMIT_REVIEW, 20260923153500) coi
// 'SUBMITTED' là đã đủ điều kiện để chuyển IN_PROGRESS -> REVIEWING. Nhưng
// qlcl_finalize_assessment_round_v1 (bản gốc 20260922010003) lại yêu cầu
// workflow_status IN ('REVIEWED','FINALIZED','COMPLETED','APPROVED') —
// không có 'SUBMITTED' — nên v_final_count luôn bằng 0 trong khi
// v_required_count luôn >= 1, FINALIZE luôn raise "Mới có 0/N tiêu chí áp
// dụng được rà soát; chưa đủ để chốt đợt." dù đã gửi đủ 100% tiêu chí.
describe("Đợt tự đánh giá — FINALIZE không còn kẹt vĩnh viễn ở trạng thái REVIEWING", () => {
  const migration = read("supabase/migrations/20261105_assessment_finalize_submitted_gate_fix_v1.sql");

  it("cổng điều kiện FINALIZE chấp nhận SUBMITTED, khớp đúng ngưỡng mà SUBMIT_REVIEW đã dùng", () => {
    expect(migration).toContain(
      "and ca.workflow_status in ('SUBMITTED','REVIEWED','FINALIZED','COMPLETED','APPROVED')",
    );
  });

  it("vẫn giữ nguyên các điều kiện FINALIZE khác (REVIEWING, lý do chốt bắt buộc, khóa record CLOSED)", () => {
    expect(migration).toContain("if not found or v_round.workflow_status <> 'REVIEWING' then");
    expect(migration).toContain("if nullif(btrim(p_reason), '') is null then");
    expect(migration).toContain("lifecycle_status = 'CLOSED'");
  });

  it("qlcl_transition_assessment_round_v1 (SUBMIT_REVIEW) vẫn dùng đúng ngưỡng SUBMITTED làm 'đã gửi' — 2 cổng nay nhất quán", () => {
    const transitionMigration = read("supabase/migrations/20260923153500_assessment_transition_atomic_v1.sql");
    expect(transitionMigration).toContain(
      "and ca.workflow_status in ('SUBMITTED','REVIEWED','FINALIZED','COMPLETED','APPROVED')",
    );
  });
});
