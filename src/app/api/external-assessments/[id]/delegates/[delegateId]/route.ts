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

// Báo cáo audit bảo mật: IDOR — trước đây chỉ xác nhận recordId (param :id)
// thuộc quyền xem của người gọi, nhưng câu PATCH/DELETE thật sự lại chỉ lọc
// theo delegateId (PK toàn cục của external_assessment_delegates), không hề
// ràng buộc delegateId phải thuộc ĐÚNG recordId đang thao tác. Người có
// quyền criteria.manage/.review ở TỔ CHỨC A, miễn gửi đúng 1 recordId họ có
// quyền xem (của tổ chức A) kèm delegateId của tổ chức B, vẫn sửa/xoá được
// thành viên đoàn đánh giá ngoài của tổ chức B. Sửa: resolveEventId() trả
// về external_assessment_events.id ĐÚNG của recordId đã xác nhận quyền xem,
// rồi PATCH/DELETE bắt buộc .eq("external_assessment_event_id", eventId) —
// cùng khuôn mẫu mọi route 2-tham-số lồng nhau khác trong app đang dùng
// (vd incoming-documents/[id]/tasks/[taskId]).
async function resolveEventId(supabase: Awaited<ReturnType<typeof createClient>>, recordId: string) {
  const { data: record } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "EXTERNAL_ASSESSMENT").maybeSingle();
  if (!record) return null;
  const { data: event } = await supabase.from("external_assessment_events").select("id").eq("record_id", recordId).maybeSingle();
  return event?.id ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; delegateId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!(await checkManageOrReview(supabase))) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId, delegateId } = await params;
  const eventId = await resolveEventId(supabase, recordId);
  if (!eventId) {
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
  const { data, error } = await admin
    .from("external_assessment_delegates")
    .update(update)
    .eq("id", delegateId)
    .eq("external_assessment_event_id", eventId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
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
  const eventId = await resolveEventId(supabase, recordId);
  if (!eventId) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error, count } = await admin.from("external_assessment_delegates").delete({ count: "exact" }).eq("id", delegateId).eq("external_assessment_event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy thành viên đoàn." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
