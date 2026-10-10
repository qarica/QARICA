import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Tự rà theo đúng lớp lỗi "4 mắt" đã sửa cho EMR go-live gate, CAPA, Action
// cá nhân, và chỉ số chất lượng: đợt Giám sát (5S/bảng kiểm chung) tách
// riêng quyền monitoring.perform (đi kiểm tra) và checklists.manage
// (Phòng QLCL xác nhận) — đúng ý định "người xác nhận phải khác người đi
// kiểm tra". Nhưng qlcl_monitoring_confirm_v1 chưa từng kiểm tra điều này —
// route.ts còn SELECT round.lead_assessor_id nhưng chưa bao giờ dùng để
// chặn. Một người có cả 2 quyền có thể tự xác nhận ngay đợt mình vừa kiểm
// tra, không ai đối chiếu độc lập.
describe("Giám sát (5S/bảng kiểm) — chặn Phòng QLCL tự xác nhận đợt do chính mình đi kiểm tra", () => {
  const migration = read("supabase/migrations/20261104_monitoring_confirm_self_block_v1.sql");

  it("qlcl_monitoring_confirm_v1 kiểm tra actor khác answered_by trước khi cho CONFIRMED", () => {
    expect(migration).toContain("if exists(\n    select 1\n    from public.checklist_responses\n    where monitoring_round_id=p_round_id\n      and answered_by=p_actor_user_id\n  ) then\n    raise exception 'Confirmation actor must differ from whoever performed this monitoring round';");
  });

  it("vẫn giữ nguyên điều kiện cũ: phải AWAITING_CONFIRMATION và mọi Không đạt đã qua kiểm tra lại PASS", () => {
    expect(migration).toContain("if v_round.workflow_status <> 'AWAITING_CONFIRMATION' then");
    expect(migration).toContain("raise exception 'All failed items must pass recheck before confirmation';");
  });

  it("route xác nhận map lỗi tự xác nhận về 409 cùng nhóm với các điều kiện chưa đủ để xác nhận khác", () => {
    const route = read("src/app/api/monitoring/rounds/[id]/confirm/route.ts");
    expect(route).toContain("must differ from whoever performed");
  });
});
