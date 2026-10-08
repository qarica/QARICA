import type { createAdminClient } from "@/lib/supabase/admin";

type FormItemLike = {
  id: string;
  title: string;
  department_ids: string[] | null;
  details: Record<string, unknown> | null;
};

// Yêu cầu tường minh của người dùng: khi 1 mục Biểu mẫu (BIEU_MAU) được đánh
// dấu "Cần đào tạo", hệ thống tự tạo luôn 1 nhiệm vụ Đào tạo (DAO_TAO) liên
// kết ngược tới đúng biểu mẫu đó — không bắt người dùng mở lại menu Đào tạo
// để khai báo thủ công như trước (link "Tạo nhiệm vụ đào tạo →" cũ). Đối
// tượng cần đào tạo kế thừa "Đối tượng thực hiện" (details.target_roles) và
// phạm vi áp dụng kế thừa department_ids của chính biểu mẫu — cùng một dữ
// liệu, không khai báo lại.
//
// Idempotent theo related_form_id: chỉ tạo khi CHƯA có nhiệm vụ đào tạo nào
// tham chiếu item này — gọi lại nhiều lần (mỗi lần sửa biểu mẫu vẫn giữ "Cần
// đào tạo") không tạo trùng. Không đồng bộ ngược khi biểu mẫu đổi phạm vi sau
// đó — nhiệm vụ đào tạo là 1 bản ghi độc lập từ lúc tạo, giống cách link thủ
// công cũ hoạt động.
export async function autoCreateTrainingTaskIfNeeded(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  actorUserId: string,
  formItem: FormItemLike,
): Promise<void> {
  if (!formItem.details || formItem.details.training_required !== "Cần đào tạo") return;

  const { data: existing } = await admin
    .from("emr_rollout_items")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("category", "DAO_TAO")
    .filter("details->>related_form_id", "eq", formItem.id)
    .limit(1);
  if (existing && existing.length) return;

  const targetRoles = typeof formItem.details.target_roles === "string" ? formItem.details.target_roles : "";

  await admin.from("emr_rollout_items").insert({
    organization_id: organizationId,
    category: "DAO_TAO",
    title: `Đào tạo: ${formItem.title}`,
    status: "TODO",
    priority: "MEDIUM",
    department_ids: formItem.department_ids ?? [],
    details: {
      related_form_id: formItem.id,
      ...(targetRoles ? { target_roles: targetRoles } : {}),
    },
    created_by: actorUserId,
    updated_by: actorUserId,
  });
}
