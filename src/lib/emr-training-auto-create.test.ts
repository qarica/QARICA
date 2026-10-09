import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu tường minh: tick "Cần đào tạo" ở Khai báo biểu mẫu phải tự tạo
// nhiệm vụ bên menu Đào tạo ngay, không bắt người dùng khai báo lại — đối
// tượng cần đào tạo kế thừa "Đối tượng thực hiện" và phạm vi áp dụng kế thừa
// department_ids của chính biểu mẫu đó.
describe("Biểu mẫu 'Cần đào tạo' tự tạo nhiệm vụ Đào tạo, kế thừa phạm vi + đối tượng", () => {
  const helper = read("src/lib/emr-training-auto-create.ts");

  it("chỉ tạo khi details.training_required === 'Cần đào tạo'", () => {
    expect(helper).toContain('formItem.details.training_required !== "Cần đào tạo"');
  });

  it("idempotent theo related_form_id — không tạo trùng khi lưu lại nhiều lần", () => {
    expect(helper).toContain('.filter("details->>related_form_id", "eq", formItem.id)');
    expect(helper).toContain("if (existing && existing.length) return;");
  });

  it("nhiệm vụ mới kế thừa department_ids (phạm vi áp dụng) và target_roles (đối tượng thực hiện) của biểu mẫu", () => {
    expect(helper).toContain("department_ids: formItem.department_ids ?? []");
    expect(helper).toContain("const targetRoles = typeof formItem.details.target_roles === \"string\" ? formItem.details.target_roles : \"\";");
    expect(helper).toContain("related_form_id: formItem.id");
  });

  it("được gọi từ cả POST (tạo mới) và PATCH (sửa) của items route, chỉ khi category là BIEU_MAU", () => {
    const postRoute = read("src/app/api/emr/items/route.ts");
    expect(postRoute).toContain('import { autoCreateTrainingTaskIfNeeded } from "@/lib/emr-training-auto-create";');
    expect(postRoute).toContain('if (category === "BIEU_MAU" && data.publish_status === "PUBLISHED") await autoCreateTrainingTaskIfNeeded(admin, organizationId, auth.user.id, data);');

    const patchRoute = read("src/app/api/emr/items/[id]/route.ts");
    expect(patchRoute).toContain('import { autoCreateTrainingTaskIfNeeded } from "@/lib/emr-training-auto-create";');
    expect(patchRoute).toContain('if (existing.category === "BIEU_MAU" && data.publish_status === "PUBLISHED") await autoCreateTrainingTaskIfNeeded(admin, organizationId, auth.user.id, data);');
  });

  // Tự rà sau khi ship tính năng duyệt phát hành: trước đây hàm này chạy trên
  // MỌI lần PATCH biểu mẫu kể cả còn Nháp — training_required không nằm
  // trong các field bị gate publish_status chặn, nên chỉ cần tick "Cần đào
  // tạo" là đã tự tạo nhiệm vụ Đào tạo ngay, đi trước cả bước duyệt phát
  // hành (đúng yêu cầu "sau khi duyệt mới triển khai"). Chỉ tự tạo khi biểu
  // mẫu ĐÃ duyệt (publish_status === PUBLISHED trên bản ghi SAU khi lưu).
  it("chỉ tự tạo nhiệm vụ đào tạo khi biểu mẫu ĐÃ duyệt phát hành (publish_status === PUBLISHED), không tạo khi còn Nháp", () => {
    const postRoute = read("src/app/api/emr/items/route.ts");
    expect(postRoute).toContain('data.publish_status === "PUBLISHED"');
    const patchRoute = read("src/app/api/emr/items/[id]/route.ts");
    expect(patchRoute).toContain('data.publish_status === "PUBLISHED"');
  });

  it("DAO_TAO có field 'Đối tượng cần đào tạo' (target_roles) dùng chung options với Biểu mẫu", () => {
    const categories = read("src/lib/emr-categories.ts");
    expect(categories).toContain('{ key: "target_roles", label: "Đối tượng cần đào tạo", type: "multiselect"');
  });

  it("UI tải lại refItems ngay sau khi lưu để link đổi thành 'Duyệt đào tạo →' không cần tải lại trang", () => {
    const client = read("src/components/emr-category-client.tsx");
    expect(client).toContain("async function fetchRefItems()");
    expect(client).toContain("fetchRefItems().then(setRefItems);");
  });
});
