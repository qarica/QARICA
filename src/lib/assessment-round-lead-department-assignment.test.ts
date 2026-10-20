import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi thực tế: "Phần tạo tự đánh giá nhưng không có chỗ phân công các
// tiêu chí để tạo đợt đánh giá" — mọi tiêu chí trong đợt đều hiện "Chưa gán
// khoa/phòng" dù criteria_items.owner_department_id (bắt buộc khi soạn Bộ
// tiêu chí) đã có giá trị. Nguyên nhân 3 phần: (1) qlcl_create_domain_record_v1
// seed assessment_round_criteria nhưng không copy owner_department_id sang
// lead_department_id, (2) đợt đã tạo trước khi vá không tự cập nhật, (3) PATCH
// /api/criteria-items/[id] khóa mọi field (kể cả owner_department_id) khi
// phiên bản đã PUBLISHED, nên không gán lại được cho các tiêu chí cũ.
describe("Đợt tự đánh giá: seed khoa/phòng phụ trách từ Bộ tiêu chí khi tạo đợt mới", () => {
  it("migration vá đúng 1 câu insert của nhánh ASSESSMENT, copy owner_department_id sang lead_department_id", () => {
    const migration = read("supabase/migrations/20261113_assessment_round_lead_department_seed_v1.sql");
    expect(migration).toContain("create or replace function public.qlcl_create_domain_record_v1(");
    expect(migration).toMatch(
      /insert into public\.assessment_round_criteria\(\s*assessment_round_id,criteria_item_id,criterion_id,is_required,lead_department_id\s*\)\s*select v_domain_id,ci\.id,ci\.id,true,ci\.owner_department_id/
    );
  });
});

describe("Đợt tự đánh giá: RPC đồng bộ khoa/phòng phụ trách cho đợt đã tạo trước khi vá", () => {
  const migration = read("supabase/migrations/20261113173000_assessment_round_lead_department_sync_v1.sql");

  it("chỉ cho đồng bộ khi đợt còn ở trạng thái Chuẩn bị (DRAFT), xác nhận đúng tổ chức, ghi audit_logs", () => {
    expect(migration).toContain("create or replace function public.qlcl_sync_assessment_round_lead_departments_v1(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to ''");
    expect(migration).toContain("if v_round.workflow_status <> 'DRAFT' then");
    expect(migration).toContain("join public.records r on r.id = ar.record_id");
    expect(migration).toContain("where ar.id = p_assessment_round_id and r.organization_id = v_org");
    expect(migration).toContain("'ASSESSMENT_ROUND_SYNC_LEAD_DEPARTMENTS'");
  });

  it("chỉ update các dòng khớp criteria_item_id và owner_department_id khác null, không ghi đè bằng null", () => {
    expect(migration).toContain("set lead_department_id = ci.owner_department_id");
    expect(migration).toContain("and ci.owner_department_id is not null");
  });

  it("khóa quyền thực thi cho service_role, không cho public/anon/authenticated gọi trực tiếp", () => {
    expect(migration).toContain(
      "revoke all on function public.qlcl_sync_assessment_round_lead_departments_v1(uuid, uuid)\n  from public, anon, authenticated;"
    );
    expect(migration).toContain(
      "grant execute on function public.qlcl_sync_assessment_round_lead_departments_v1(uuid, uuid)\n  to service_role;"
    );
  });
});

describe("API /api/assessments/[id]/sync-departments", () => {
  const route = read("src/app/api/assessments/[id]/sync-departments/route.ts");

  it("yêu cầu đăng nhập và quyền criteria.manage trước khi gọi RPC đồng bộ", () => {
    expect(route).toContain('supabase.rpc("has_permission", { p_permission_code: "criteria.manage" })');
    expect(route).toContain('if (!manage) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đợt tự đánh giá." }, { status: 403 });');
  });

  it("xác nhận record thuộc đúng tổ chức của người gọi trước khi đồng bộ", () => {
    expect(route).toContain('record.organization_id !== caller.organization_id');
  });

  it("gọi đúng RPC qlcl_sync_assessment_round_lead_departments_v1 với id đợt (assessment_rounds.id), không phải record_id", () => {
    expect(route).toContain('const SYNC_RPC = "qlcl_sync_assessment_round_lead_departments_v1"');
    expect(route).toContain("p_assessment_round_id: round.id");
  });
});

describe("UI: nút đồng bộ khoa/phòng phụ trách ở trạng thái Chuẩn bị (DRAFT)", () => {
  const client = read("src/components/assessment-workflow-client.tsx");

  it("chỉ hiện khi đợt đang DRAFT và người dùng có quyền quản lý, gọi đúng API sync-departments", () => {
    expect(client).toContain('status==="DRAFT"&&canManage?<button className="button secondary" disabled={busy} onClick={()=>void syncDepartments()}>Đồng bộ khoa/phòng phụ trách từ Bộ tiêu chí</button>:null');
    expect(client).toContain("`/api/assessments/${recordId}/sync-departments`");
  });
});

// Root cause phần 3: UI "Khoa/phòng phụ trách *" trong Bộ tiêu chí (bắt buộc,
// đã đúng từ trước) chỉ dùng được khi phiên bản đang DRAFT, vì nút "Sửa" toàn
// bộ tiêu chí bị khóa khi PUBLISHED — nhưng 131 tiêu chí hiện có đều đã
// PUBLISHED, nên không ai gán lại được owner_department_id cho chúng. Mở một
// lối cập nhật RIÊNG cho field này (không mở khóa toàn bộ nội dung tiêu chí).
describe("PATCH /api/criteria-items/[id]: cho phép cập nhật riêng owner_department_id kể cả khi phiên bản đã PUBLISHED", () => {
  const route = read("src/app/api/criteria-items/[id]/route.ts");

  it("chỉ bỏ qua gate DRAFT khi body CHỈ có owner_department_id và/hoặc support_department_ids, không ảnh hưởng các field nội dung khác", () => {
    expect(route).toContain(
      'const DEPARTMENT_ASSIGNMENT_FIELDS=["owner_department_id","support_department_ids"];'
    );
    expect(route).toContain(
      'const nonDepartmentKeys=Object.keys(body).filter((key)=>!DEPARTMENT_ASSIGNMENT_FIELDS.includes(key));'
    );
    expect(route).toContain(
      'const isDepartmentOnlyUpdate=DEPARTMENT_ASSIGNMENT_FIELDS.some((key)=>Object.prototype.hasOwnProperty.call(body,key))&&nonDepartmentKeys.length===0;'
    );
    expect(route).toContain(
      'if(version.status!=="DRAFT"&&!isDepartmentOnlyUpdate)return NextResponse.json({error:"Phiên bản đã phát hành không được sửa trực tiếp. Hãy tạo bản cập nhật mới."},{status:409});'
    );
  });

  it("vẫn xác nhận khoa/phòng thuộc đúng tổ chức và bắt buộc không được để trống", () => {
    expect(route).toContain('if(!departmentId)return NextResponse.json({error:"Khoa/phòng phụ trách tiêu chí là bắt buộc."},{status:400});');
    expect(route).toContain('.eq("organization_id",set.organization_id).eq("is_active",true).maybeSingle();');
  });
});

describe("UI criteria-set-editor-client.tsx: gán khoa/phòng phụ trách ngay trên danh sách, không cần mở phiên bản Nháp", () => {
  const client = read("src/components/criteria-set-editor-client.tsx");

  it("có hàm assignDepartment gọi PATCH chỉ với owner_department_id", () => {
    expect(client).toContain("async function assignDepartment(item:Item,departmentId:string)");
    expect(client).toContain('body:JSON.stringify({owner_department_id:departmentId})');
  });

  it("select gán khoa/phòng hiện ra khi canManage (không phụ thuộc editable/DRAFT) cho cả tiêu chí cấp 1 và tiểu mục", () => {
    expect(client).toContain("onChange={e=>assignDepartment(root,e.target.value)}");
    expect(client).toContain("onChange={e=>assignDepartment(child,e.target.value)}");
  });
});
