import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Xoá 1 đăng ký sai/trùng (vd đăng ký nhầm, đăng ký 2 lần bằng cách gõ sai
// mã NV lần đầu) — đăng ký chỉ là danh sách báo trước, không phải điểm/kết
// quả nên xoá thẳng, không cần giữ lịch sử.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, registrationId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { error, count } = await admin
    .from("procedure_training_registrations")
    .delete({ count: "exact" })
    .eq("id", registrationId)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy đăng ký." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
