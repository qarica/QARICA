import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261030_record_lifecycle_cascade_cancel_fail_loud_v1.sql", "utf8");

// Phát hiện (báo cáo thực tế): "5 action tháng 9 còn active dù kế hoạch đã
// hủy". Root cause: vòng lặp cascade-hủy trong qlcl_change_record_lifecycle_v1
// (20261009_record_lifecycle_program_cascade_v3.sql) bọc mỗi lần hủy hồ sơ
// con trong `exception when others then null;` — nuốt MỌI lỗi, không chỉ 2
// trường hợp hồ sơ con đã ở trạng thái kết thúc hợp lệ, khiến hồ sơ con "treo"
// active trong khi hồ sơ cha đã hiện Đã hủy, không ai biết để xử lý.
describe("qlcl_change_record_lifecycle_v1 — cascade-hủy không còn nuốt lỗi im lặng", () => {
  it("chỉ bỏ qua đúng 2 thông báo lỗi hợp lệ (hồ sơ con đã kết thúc từ trước), mọi lỗi khác làm thất bại cả giao dịch", () => {
    expect(migration).toContain("exception when others then\n          if sqlerrm not in ('Hồ sơ đã ngưng hoạt động.','Hồ sơ đã đóng; không thể hủy.') then\n            raise;\n          end if;\n        end;");
  });

  it("vẫn cascade qua record_links HAS_ACTION/HAS_OUTPUT như migration gốc", () => {
    expect(migration).toContain("select target_record_id from public.record_links");
    expect(migration).toContain("where source_record_id=p_record_id and relation_type in ('HAS_ACTION','HAS_OUTPUT')");
  });

  it("đồng thời dò thêm action qua program_action_links, phòng hồ sơ con bị bỏ sót hoàn toàn khỏi cascade chứ không chỉ bị nuốt lỗi", () => {
    expect(migration).toContain("join public.actions a on a.id=pal.action_id");
    expect(migration).toContain("join public.work_programs wp on wp.id=pal.program_id");
    expect(migration).toContain("where wp.record_id=p_record_id");
  });

  it("vẫn cascade bằng cách gọi đệ quy đúng RPC chung (không phải cơ chế hủy riêng từng bảng)", () => {
    expect(migration).toContain("perform public.qlcl_change_record_lifecycle_v1(");
    expect(migration).toContain("v_child_record_id,p_actor_user_id,'CANCEL',");
  });

  it("khắc phục dữ liệu đã treo trước khi sửa: hủy nốt hồ sơ con active của PROGRAM đã hủy, dùng người đã hủy PROGRAM đó làm actor", () => {
    expect(migration).toContain("select changed_by into v_actor_user_id");
    expect(migration).toContain("where record_id=v_program.id and new_status='CANCELLED'");
    expect(migration).toContain("if v_actor_user_id is null then continue; end if;");
    expect(migration).toContain("where r.lifecycle_status not in ('CANCELLED','ARCHIVED','RETIRED','INACTIVE','CLOSED')");
  });

  it("vẫn giữ nguyên cấp quyền chỉ cho service_role (không nới lỏng truy cập RPC)", () => {
    expect(migration).toContain("revoke all on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)\n  from public,anon,authenticated;");
    expect(migration).toContain("grant execute on function public.qlcl_change_record_lifecycle_v1(uuid,uuid,text,text)\n  to service_role;");
  });
});
