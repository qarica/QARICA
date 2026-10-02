import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// State machine: OPEN -> SENT_TO_DEPT -> (DEPT_ACKNOWLEDGED | DEPT_DISPUTED)
// DEPT_DISPUTED -> HEAD_APPROVED (head_decision: UPHELD | WAIVED)
// DEPT_ACKNOWLEDGED | HEAD_APPROVED -> RESOLVED
const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  SEND: { from: ["OPEN"], to: "SENT_TO_DEPT" },
  ACK: { from: ["SENT_TO_DEPT"], to: "DEPT_ACKNOWLEDGED" },
  DISPUTE: { from: ["SENT_TO_DEPT"], to: "DEPT_DISPUTED" },
  DECIDE: { from: ["DEPT_DISPUTED"], to: "HEAD_APPROVED" },
  RESOLVE: { from: ["DEPT_ACKNOWLEDGED", "HEAD_APPROVED"], to: "RESOLVED" },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
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

  const { data: current, error: currentError } = await admin
    .from("hsba_audit_findings")
    .select("id,status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy lỗi." }, { status: 404 });
  if (!transition.from.includes(current.status)) {
    return NextResponse.json({ error: `Trạng thái hiện tại (${current.status}) không cho phép thao tác này.` }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: transition.to, updated_at: new Date().toISOString() };
  if (action === "SEND") update.sent_at = new Date().toISOString();
  if (action === "ACK" || action === "DISPUTE") {
    const response = String(body.department_response || "").trim();
    if (!response) return NextResponse.json({ error: "Khoa cần nhập nội dung phản hồi." }, { status: 400 });
    update.department_response = response;
    update.department_responded_at = new Date().toISOString();
  }
  if (action === "DECIDE") {
    const decision = body.head_decision === "WAIVED" ? "WAIVED" : body.head_decision === "UPHELD" ? "UPHELD" : null;
    if (!decision) return NextResponse.json({ error: "Chưa chọn quyết định (Giữ nguyên lỗi / Miễn lỗi)." }, { status: 400 });
    update.head_decision = decision;
    update.head_decided_by = auth.user.id;
    update.head_decided_at = new Date().toISOString();
  }
  if (action === "RESOLVE") update.resolved_at = new Date().toISOString();
  if (body.owner_user_id !== undefined) update.owner_user_id = body.owner_user_id || null;

  const { data, error } = await admin
    .from("hsba_audit_findings")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(
      "id,audit_id,department_id,owner_user_id,description,status,sent_at,department_response,department_responded_at,head_decision,head_decided_at,resolved_at,audit_type",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, finding: data });
}
