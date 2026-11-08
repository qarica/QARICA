import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,title,smart_measurable,target_date,status,created_by,created_at,updated_at";

export async function GET() {
  const auth = await requireApiPermission("work_plans.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("work_plans")
    .select(SELECT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, plans: data ?? [] });
}

// SMART ở cấp kế hoạch: Specific=title, Measurable=smart_measurable (tùy
// chọn), Time-bound=target_date (tùy chọn) — Achievable/Relevant là phán
// đoán của người lập, không có trường riêng (xem migration).
export async function POST(request: Request) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Chưa nhập mục tiêu kế hoạch." }, { status: 400 });

  const { data, error } = await admin
    .from("work_plans")
    .insert({
      organization_id: organizationId,
      title,
      smart_measurable: body.smart_measurable ? String(body.smart_measurable).trim() || null : null,
      target_date: body.target_date || null,
      created_by: auth.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, plan: data });
}
