import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = "id,sort_order,full_name,title,organization,specialty_area,phone,host_name,pickup_time,pickup_location,notes";
const EDITABLE_FIELDS = ["full_name", "title", "organization", "specialty_area", "phone", "host_name", "pickup_time", "pickup_location", "notes", "sort_order"];

async function checkManageOrReview(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: manage }, { data: review }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
  ]);
  return Boolean(manage || review);
}

async function assertRecordVisible(supabase: Awaited<ReturnType<typeof createClient>>, recordId: string) {
  const { data } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "EXTERNAL_ASSESSMENT").maybeSingle();
  return Boolean(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; delegateId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!(await checkManageOrReview(supabase))) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId, delegateId } = await params;
  if (!(await assertRecordVisible(supabase, recordId))) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "sort_order") {
      update.sort_order = Number(body.sort_order) || 0;
    } else if (field === "full_name") {
      const value = String(body.full_name || "").trim();
      if (!value) return NextResponse.json({ error: "Tên thành viên đoàn không được để trống." }, { status: 400 });
      update.full_name = value;
    } else {
      update[field] = String(body[field]).trim() || null;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin.from("external_assessment_delegates").update(update).eq("id", delegateId).select(SELECT_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy thành viên đoàn." }, { status: 404 });
  return NextResponse.json({ ok: true, delegate: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; delegateId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!(await checkManageOrReview(supabase))) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId, delegateId } = await params;
  if (!(await assertRecordVisible(supabase, recordId))) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("external_assessment_delegates").delete().eq("id", delegateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
