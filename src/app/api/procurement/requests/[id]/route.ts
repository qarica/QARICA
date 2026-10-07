import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// State machine: SUBMITTED -> (BGD_APPROVED | BGD_REJECTED)
// BGD_APPROVED -> (TGD_APPROVED | TGD_REJECTED)
// TGD_APPROVED | BGD_REJECTED | TGD_REJECTED -> NOTIFIED
const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  BGD_APPROVE: { from: ["SUBMITTED"], to: "BGD_APPROVED" },
  BGD_REJECT: { from: ["SUBMITTED"], to: "BGD_REJECTED" },
  TGD_APPROVE: { from: ["BGD_APPROVED"], to: "TGD_APPROVED" },
  TGD_REJECT: { from: ["BGD_APPROVED"], to: "TGD_REJECTED" },
  NOTIFY: { from: ["TGD_APPROVED", "BGD_REJECTED", "TGD_REJECTED"], to: "NOTIFIED" },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procurement.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const transition = TRANSITIONS[action];
  if (!transition) return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });

  // The 2-tier chain only means something if BGĐ and TGĐ approval require
  // separate permissions — previously both steps were gated by the same
  // single procurement.manage, so anyone who could do one could do both.
  const isBgdAction = action === "BGD_APPROVE" || action === "BGD_REJECT";
  const isTgdAction = action === "TGD_APPROVE" || action === "TGD_REJECT";
  if (isBgdAction) {
    const { data: canBgd } = await auth.supabase.rpc("has_permission", { p_permission_code: "procurement.approve_bgd" });
    if (!canBgd) return NextResponse.json({ error: "Bạn không có quyền duyệt ở cấp Ban Giám đốc." }, { status: 403 });
  }
  if (isTgdAction) {
    const { data: canTgd } = await auth.supabase.rpc("has_permission", { p_permission_code: "procurement.approve_tgd" });
    if (!canTgd) return NextResponse.json({ error: "Bạn không có quyền duyệt ở cấp Tổng Giám đốc." }, { status: 403 });
  }

  const { data: current, error: currentError } = await admin
    .from("procurement_requests")
    .select("id,status,bgd_decided_by")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy đề xuất." }, { status: 404 });
  if (!transition.from.includes(current.status)) {
    return NextResponse.json({ error: `Trạng thái hiện tại (${current.status}) không cho phép thao tác này.` }, { status: 400 });
  }
  // A real 2-level chain requires 2 different people — someone who holds
  // both approve_bgd and approve_tgd must still not be able to approve their
  // own BGĐ decision again at the TGĐ step.
  if (isTgdAction && current.bgd_decided_by && current.bgd_decided_by === auth.user.id) {
    return NextResponse.json({ error: "Người duyệt cấp TGĐ phải khác người đã duyệt cấp BGĐ." }, { status: 403 });
  }

  const update: Record<string, unknown> = { status: transition.to, updated_at: new Date().toISOString() };
  if (isBgdAction) {
    update.bgd_decided_by = auth.user.id;
    update.bgd_decided_at = new Date().toISOString();
    if (body.note) update.bgd_note = String(body.note).trim() || null;
  }
  if (isTgdAction) {
    update.tgd_decided_by = auth.user.id;
    update.tgd_decided_at = new Date().toISOString();
    if (body.note) update.tgd_note = String(body.note).trim() || null;
  }
  if (action === "NOTIFY") update.notified_at = new Date().toISOString();

  const { data, error } = await admin
    .from("procurement_requests")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(
      "id,department_id,request_type,urgency,title,description,quantity,unit_price,estimated_cost,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, request: data });
}
