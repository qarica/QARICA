import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Báo cáo thực tế: "Danh mục biểu mẫu còn thiếu duyệt phát hành hoặc cập
// nhật. Sau khi duyệt mới triển khai, áp dụng, tiến độ" — thêm trạng thái
// duyệt (DRAFT/PUBLISHED) riêng cho từng biểu mẫu (emr_rollout_items.
// publish_status), theo đúng mô hình "trạng thái duyệt riêng cho từng biểu
// mẫu" người dùng đã chọn (không clone mô hình Template/Phiên bản của Bảng
// kiểm Giám sát/Audit HSBA, không dùng chung module Kiểm soát tài liệu).
describe("EMR Biểu mẫu — trạng thái duyệt phát hành (publish_status)", () => {
  const migration = read("supabase/migrations/20261031_emr_rollout_items_publish_status_v1.sql");
  const patchRoute = read("src/app/api/emr/items/[id]/route.ts");
  const postRoute = read("src/app/api/emr/items/route.ts");
  const client = read("src/components/emr-category-client.tsx");

  it("migration thêm publish_status/published_at/published_by, default DRAFT cho hạng mục mới, backfill PUBLISHED cho hạng mục cũ", () => {
    expect(migration).toContain("add column if not exists publish_status text");
    expect(migration).toContain("add column if not exists published_at timestamptz");
    expect(migration).toContain("add column if not exists published_by uuid references auth.users(id)");
    expect(migration).toContain("set publish_status = 'PUBLISHED', published_at = coalesce(published_at, created_at)");
    expect(migration).toContain("alter column publish_status set default 'DRAFT'");
    expect(migration).toContain("check (publish_status in ('DRAFT','PUBLISHED'))");
  });

  it("POST tạo hạng mục mới không tự set publish_status (luôn rơi vào default DRAFT của cột) và ép department_ids rỗng cho BIEU_MAU", () => {
    expect(postRoute).not.toMatch(/publish_status:\s*["']PUBLISHED["']/);
    expect(postRoute).toContain('const effectiveDepartmentIds = category === "BIEU_MAU" ? [] : departmentIdsResult.ids;');
  });

  it("PATCH: 'Duyệt phát hành' là hành động riêng (body.publish:true), chỉ cho BIEU_MAU, chặn duyệt lại hạng mục đã PUBLISHED", () => {
    expect(patchRoute).toContain("if (body.publish === true) {");
    expect(patchRoute).toContain('if (existing.category !== "BIEU_MAU") return NextResponse.json({ error: "Chỉ Biểu mẫu mới cần duyệt phát hành." }, { status: 400 });');
    expect(patchRoute).toContain('if (existing.publish_status === "PUBLISHED") return NextResponse.json({ error: "Biểu mẫu đã được duyệt phát hành." }, { status: 400 });');
    expect(patchRoute).toContain('patch.publish_status = "PUBLISHED";');
  });

  it("PATCH: sửa nội dung khai báo (title/description/details/due_date/priority) của biểu mẫu ĐÃ duyệt tự đưa về Nháp — so sánh giá trị thực sự đổi, không chỉ field có mặt trong body", () => {
    expect(patchRoute).toContain('(typeof patch.title === "string" && patch.title !== existing.title)');
    expect(patchRoute).toContain('(typeof patch.priority === "string" && patch.priority !== existing.priority)');
    expect(patchRoute).toContain("if (contentChanged && existing.publish_status === \"PUBLISHED\") {");
    expect(patchRoute).toContain('patch.publish_status = "DRAFT";');
  });

  it("PATCH: record_types (gán phạm vi loại hồ sơ bệnh án) KHÔNG được coi là 'sửa nội dung' — loại record_types trước khi so sánh details, tránh tick ô ma trận tự rút biểu mẫu về Nháp", () => {
    expect(patchRoute).toContain("const detailsForContentComparison = (d: Record<string, unknown> | null | undefined) => { const rest = { ...(d || {}) }; delete rest.record_types; delete rest.binding_group; delete rest.binding_group_order; return rest; };");
    expect(patchRoute).toContain("JSON.stringify(detailsForContentComparison(patch.details as Record<string, unknown>)) !== JSON.stringify(detailsForContentComparison(existing.details))");
  });

  // Tự rà sau khi ship: "Cây biểu mẫu" (đổi nhóm gáy/thứ tự trong gáy) PATCH
  // { details: {...it.details, binding_group/binding_group_order} } trên MỌI
  // biểu mẫu kể cả đã Published — nếu không loại 2 field này khỏi so sánh,
  // chỉ việc kéo-thả sắp xếp lại gáy (không đụng nội dung biểu mẫu) sẽ tự rút
  // biểu mẫu đã duyệt về Nháp, buộc duyệt lại oan uổng.
  it("PATCH: binding_group/binding_group_order (tổ chức gáy ở Cây biểu mẫu) cũng KHÔNG được coi là 'sửa nội dung' — đổi nhóm/thứ tự gáy không tự rút biểu mẫu Published về Nháp", () => {
    expect(patchRoute).toContain("delete rest.binding_group;");
    expect(patchRoute).toContain("delete rest.binding_group_order;");
  });

  it("PATCH: chặn chuyển trạng thái triển khai, gán khoa/phòng, và gán loại hồ sơ bệnh án khi biểu mẫu còn Nháp", () => {
    expect(patchRoute).toContain('error: "Biểu mẫu cần được duyệt phát hành trước khi chuyển trạng thái triển khai."');
    expect(patchRoute).toContain('error: "Biểu mẫu cần được duyệt phát hành trước khi gán phạm vi áp dụng."');
    expect(patchRoute).toContain('if ("details" in patch && nextRecordTypes !== existingRecordTypes) {');
  });

  // Phát hiện Cao (tự rà sau khi ship): modal sửa luôn gửi lại NGUYÊN
  // form.status và form.department_ids mỗi lần lưu, kể cả không đổi —
  // department_ids luôn có mặt trong form dù fieldset bị ẩn cho BIEU_MAU. Nếu
  // 2 gate ở trên chỉ kiểm tra "có mặt trong body" (không so giá trị thực sự
  // đổi), thì MỌI lần sửa tiêu đề/mô tả của MỘT BIỂU MẪU MỚI TẠO (mặc định
  // Nháp, department_ids=[]) đều bị chính 2 gate đó từ chối toàn bộ request —
  // tức là modal sửa biểu mẫu bị hỏng hoàn toàn cho mọi hạng mục còn Nháp.
  it("PATCH: gate status/department_ids chỉ chặn khi GIÁ TRỊ thực sự đổi so với existing — sửa nội dung không đụng status/phạm vi (kể cả khi modal resend nguyên giá trị cũ) không bị từ chối nhầm", () => {
    expect(patchRoute).toContain('if (typeof body.status === "string" && body.status !== existing.status && body.status !== "TODO") {');
    expect(patchRoute).toContain("const existingDepartmentIds = JSON.stringify([...(existing.department_ids || [])].sort());");
    expect(patchRoute).toContain('const nextDepartmentIds = "department_ids" in patch ? JSON.stringify([...(patch.department_ids as string[])].sort()) : existingDepartmentIds;');
    expect(patchRoute).toContain("if (nextDepartmentIds !== existingDepartmentIds) {");
    // existing.department_ids phải được SELECT ra thì so sánh ở trên mới có ý
    // nghĩa — thiếu field này trong loadItemOrganization sẽ luôn so khớp với
    // undefined, vô tình chặn nhầm y hệt lỗi ban đầu.
    expect(patchRoute).toContain('select("id,organization_id,status,evidence_url,category,updated_by,title,description,details,due_date,priority,publish_status,department_ids")');
  });

  it("PATCH: ghi audit_logs khi duyệt phát hành (EMR_ITEM_PUBLISH), cùng bảng audit_logs dùng chung cho cả module", () => {
    expect(patchRoute).toContain('action_type: "EMR_ITEM_PUBLISH"');
  });

  it("UI: cột 'Duyệt phát hành' (badge Nháp/Đã duyệt + nút duyệt) chỉ hiện cho BIEU_MAU", () => {
    expect(client).toContain('{categoryCode==="BIEU_MAU"?<th>Duyệt phát hành</th>:null}');
    expect(client).toContain('{item.publish_status==="PUBLISHED"?"Đã duyệt":"Nháp"}');
    expect(client).toContain("onClick={()=>publishItem(item)}");
  });

  it("UI: ma trận Phạm vi áp dụng vô hiệu hoá tick/nút chọn-tất-cả khi biểu mẫu còn Nháp (scopeLocked)", () => {
    expect(client).toContain('const scopeLocked = item.publish_status === "DRAFT";');
    expect(client).toContain("disabled={!canManage || scopeLocked}");
  });

  it("UI: KPI 'Tiến độ triển khai' loại biểu mẫu Nháp khỏi đếm (chỉ BIEU_MAU)", () => {
    expect(client).toContain('const kpiItems = categoryCode === "BIEU_MAU" ? items.filter((i) => i.publish_status !== "DRAFT") : items;');
  });

  // Tự rà sau khi ship: select "Trạng thái triển khai" trong modal sửa KHÔNG
  // bị vô hiệu hoá khi sửa 1 biểu mẫu Nháp, dù server đã chặn chuyển trạng
  // thái ở gate PATCH — người dùng chọn 1 trạng thái khác rồi bấm Lưu mới
  // thấy lỗi "cần duyệt phát hành trước", giống đúng kiểu bug ô nhập "trông
  // như sửa được nhưng không sửa được" mà CLAUDE.md yêu cầu đối chiếu UI↔API.
  // Disable select ngay trong modal, nhất quán với scopeLocked ở ma trận.
  it("UI: select 'Trạng thái triển khai' trong modal sửa bị vô hiệu hoá khi biểu mẫu còn Nháp, kèm ghi chú lý do", () => {
    expect(client).toContain('disabled={categoryCode === "BIEU_MAU" && !!editing && editing.publish_status === "DRAFT"}');
    expect(client).toContain("Biểu mẫu cần được duyệt phát hành trước khi chuyển trạng thái triển khai.");
  });
});
