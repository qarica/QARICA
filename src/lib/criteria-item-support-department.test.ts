import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi thực tế: "Đã thêm được phụ trách chính chưa thêm được hỗ trợ" —
// criteria_items chỉ có owner_department_id (1 khoa/phòng phụ trách chính).
// Thêm support_department_ids (uuid[], nhiều khoa/phòng hỗ trợ, không bắt
// buộc), mở rộng Bộ tiêu chí theo đúng hướng đã chọn (KHÔNG dùng bảng
// criterion_responsibilities có sẵn nhưng chưa từng được API/UI nào dùng).
describe("Migration thêm criteria_items.support_department_ids và xuyên suốt các RPC liên quan", () => {
  const migration = read("supabase/migrations/20261113180000_criteria_item_support_department_v1.sql");

  it("thêm cột support_department_ids kiểu uuid[], mặc định mảng rỗng, có index gin", () => {
    expect(migration).toContain("add column if not exists support_department_ids uuid[] not null default '{}'::uuid[];");
    expect(migration).toContain("create index if not exists idx_criteria_items_support_department");
    expect(migration).toContain("using gin(support_department_ids);");
  });

  it("qlcl_create_criteria_item_v1 nhận p_support_department_ids, xác nhận từng khoa/phòng hỗ trợ hợp lệ trước khi insert", () => {
    expect(migration).toContain("p_support_department_ids uuid[] default '{}'::uuid[]");
    expect(migration).toContain("from unnest(v_support_department_ids) sid");
    expect(migration).toContain("'Một hoặc nhiều khoa/phòng hỗ trợ không hợp lệ.'");
    expect(migration).toContain(
      "parent_criteria_item_id,item_type,owner_department_id,support_department_ids,is_active,created_at,updated_at"
    );
  });

  it("qlcl_create_criteria_revision_v1 sao chép support_department_ids sang bản Nháp mới (cả tiêu chí cấp 1 và tiểu mục)", () => {
    const revisionMatches = migration.match(/coalesce\(v_item\.support_department_ids,'\{\}'::uuid\[\]\)/g) || [];
    expect(revisionMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("qlcl_create_domain_record_v1 seed assessment_round_criteria.support_department_ids từ Bộ tiêu chí khi tạo đợt mới", () => {
    expect(migration).toMatch(
      /insert into public\.assessment_round_criteria\(\s*assessment_round_id,criteria_item_id,criterion_id,is_required,lead_department_id,support_department_ids\s*\)\s*select v_domain_id,ci\.id,ci\.id,true,ci\.owner_department_id,coalesce\(ci\.support_department_ids,'\{\}'::uuid\[\]\)/
    );
  });

  it("qlcl_sync_assessment_round_lead_departments_v1 đồng bộ cả support_department_ids, không chỉ lead_department_id", () => {
    expect(migration).toContain("support_department_ids = coalesce(ci.support_department_ids,'{}'::uuid[])");
    expect(migration).toContain("coalesce(array_length(ci.support_department_ids,1),0) > 0");
  });
});

describe("API /api/criteria-sets/[id]/items (POST): nhận support_department_ids khi tạo tiêu chí", () => {
  const route = read("src/app/api/criteria-sets/[id]/items/route.ts");

  it("đọc body.support_department_ids thành mảng, loại trùng/rỗng, gửi sang RPC", () => {
    expect(route).toContain(
      "const supportDepartmentIds=Array.from(new Set((Array.isArray(body.support_department_ids)?body.support_department_ids:[]).map((v:unknown)=>clean(v)).filter(Boolean)));"
    );
    expect(route).toContain("p_support_department_ids:supportDepartmentIds,");
  });
});

describe("API /api/criteria-items/[id] (PATCH): hỗ trợ support_department_ids, vẫn bắt buộc PUBLISHED cho field nội dung khác", () => {
  const route = read("src/app/api/criteria-items/[id]/route.ts");

  it("xác nhận từng khoa/phòng hỗ trợ thuộc đúng tổ chức và đang hoạt động trước khi lưu", () => {
    expect(route).toContain('if(Object.prototype.hasOwnProperty.call(body,"support_department_ids")){');
    expect(route).toContain(
      '.from("departments").select("id").eq("organization_id",set.organization_id).eq("is_active",true).in("id",supportIds);'
    );
    expect(route).toContain('"Một hoặc nhiều khoa/phòng hỗ trợ không hợp lệ."');
    expect(route).toContain("patch.support_department_ids=supportIds;");
  });

  it("cho phép mảng rỗng (bỏ hết khoa/phòng hỗ trợ) chứ không bắt buộc như owner_department_id", () => {
    expect(route).toContain("const supportIds=Array.from(new Set(raw.map((value:unknown)=>clean(value)).filter(Boolean)));");
    expect(route).not.toContain('if(!supportIds.length)return NextResponse.json({error:"Khoa/phòng hỗ trợ là bắt buộc."}');
  });
});

describe("Trang /assessments/catalog/[id] tải support_department_ids cùng owner_department_id", () => {
  it("page.tsx select đủ cột support_department_ids cho criteria_items", () => {
    const page = read("src/app/(app)/assessments/catalog/[id]/page.tsx");
    expect(page).toContain("owner_department_id,support_department_ids,is_active,created_at,updated_at");
  });
});

describe("UI criteria-set-editor-client.tsx: gán/bỏ khoa/phòng hỗ trợ ngay trên danh sách và trong modal", () => {
  const client = read("src/components/criteria-set-editor-client.tsx");

  it("có updateSupportDepartments/addSupport/removeSupport gọi PATCH chỉ với support_department_ids", () => {
    expect(client).toContain("async function updateSupportDepartments(item:Item,ids:string[])");
    expect(client).toContain('body:JSON.stringify({support_department_ids:ids})');
    expect(client).toContain("function addSupport(item:Item,departmentId:string)");
    expect(client).toContain("function removeSupport(item:Item,departmentId:string)");
  });

  it("chip hỗ trợ và dropdown thêm hiện ra khi canManage cho cả tiêu chí cấp 1 và tiểu mục", () => {
    expect(client).toContain("onClick={()=>removeSupport(root,id)}");
    expect(client).toContain("addSupport(root,v)");
    expect(client).toContain("onClick={()=>removeSupport(child,id)}");
    expect(client).toContain("addSupport(child,v)");
  });

  it("modal tạo/sửa có checklist 'Khoa/phòng hỗ trợ (không bắt buộc)' dùng .department-checks", () => {
    expect(client).toContain("Khoa/phòng hỗ trợ (không bắt buộc)");
    expect(client).toContain('<div className="department-checks">{departments.filter(d=>d.id!==form.owner_department_id)');
  });

  it("submit() gửi support_department_ids trong payload cho cả tạo mới và cập nhật", () => {
    expect(client).toContain("support_department_ids:form.support_department_ids");
  });
});

describe("Hiển thị khoa/phòng hỗ trợ trong đợt tự đánh giá (không chỉ phụ trách chính)", () => {
  it("domain-workflow-panel.tsx đọc support_department_ids từ assessment_round_criteria và map tên khoa/phòng", () => {
    const panel = read("src/components/domain-workflow-panel.tsx");
    expect(panel).toContain(
      'supabase.from("assessment_round_criteria").select("criteria_item_id,criterion_id,is_required,applicability_status,not_applicable_reason,lead_department_id,support_department_ids")'
    );
    expect(panel).toContain("supportDepartmentNames: supportIds.map((id:string)=>assessmentDepartmentMap.get(id)||\"Khoa/phòng đã phân công\")");
  });

  it("assessment-criteria-client.tsx hiện pill 'Hỗ trợ: ...' khi có khoa/phòng hỗ trợ, và đưa vào tìm kiếm", () => {
    const client = read("src/components/assessment-criteria-client.tsx");
    expect(client).toContain("supportDepartmentNames:string[];");
    expect(client).toContain('row.supportDepartmentNames.length?<span className="code-pill">Hỗ trợ: {row.supportDepartmentNames.join(", ")}</span>:null');
    expect(client).toContain("...row.supportDepartmentNames,row.result,row.comment");
  });
});
