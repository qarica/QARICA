import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const SYNC_RPC = "qlcl_sync_assessment_round_lead_departments_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: manage } = await supabase.rpc("has_permission", { p_permission_code: "criteria.manage" });
  if (!manage) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đợt tự đánh giá." }, { status: 403 });

  const { id: recordId } = await params;
  const admin: any = createAdminClient();

  const [{ data: caller }, { data: record }, { data: round }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle(),
    admin.from("assessment_rounds").select("id").eq("record_id", recordId).maybeSingle(),
  ]);

  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id) {
    return NextResponse.json({ error: "Không tìm thấy đợt tự đánh giá trong phạm vi đơn vị hiện tại." }, { status: 404 });
  }
  if (!round) return NextResponse.json({ error: "Không tìm thấy dữ liệu đợt đánh giá." }, { status: 404 });

  const { data, error } = await admin.rpc(SYNC_RPC, {
    p_actor_user_id: auth.user.id,
    p_assessment_round_id: round.id,
  });
  if (error) {
    const message = rpcErrorMessage(error, "Không thể đồng bộ khoa/phòng phụ trách.");
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const updated = Number(data?.updated_count ?? 0);
  return NextResponse.json({
    ok: true,
    message: updated > 0
      ? `Đã đồng bộ khoa/phòng phụ trách cho ${updated} tiêu chí.`
      : "Không có tiêu chí nào cần đồng bộ (Bộ tiêu chí chưa phân công khoa/phòng hoặc đã đồng bộ trước đó).",
    updated_count: updated,
  });
}
