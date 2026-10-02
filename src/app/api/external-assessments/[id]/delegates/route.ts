import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = "id,sort_order,full_name,title,organization,specialty_area,phone,host_name,pickup_time,pickup_location,notes";

async function resolveEventId(supabase: Awaited<ReturnType<typeof createClient>>, recordId: string) {
  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "EXTERNAL_ASSESSMENT").maybeSingle();
  if (!visible) return { eventId: null, notFound: true as const };
  const { data: event } = await supabase.from("external_assessment_events").select("id").eq("record_id", recordId).maybeSingle();
  return { eventId: event?.id ?? null, notFound: false as const };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: view }, { data: review }, { data: manage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.view" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
  ]);
  if (!view && !review && !manage) return NextResponse.json({ error: "Bạn chưa có quyền xem đánh giá ngoài." }, { status: 403 });

  const { id: recordId } = await params;
  const { eventId, notFound } = await resolveEventId(supabase, recordId);
  if (notFound) return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });
  if (!eventId) return NextResponse.json({ ok: true, delegates: [] });

  const admin = createAdminClient();
  const { data, error } = await admin.from("external_assessment_delegates").select(SELECT_COLUMNS).eq("external_assessment_event_id", eventId).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, delegates: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: manage }, { data: review }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
  ]);
  if (!manage && !review) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId } = await params;
  const { eventId, notFound } = await resolveEventId(supabase, recordId);
  if (notFound) return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });
  if (!eventId) return NextResponse.json({ error: "Đợt đánh giá ngoài chưa được khởi tạo đầy đủ." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const fullName = String(body.full_name || "").trim();
  if (!fullName) return NextResponse.json({ error: "Chưa nhập tên thành viên đoàn." }, { status: 400 });

  const admin = createAdminClient();
  const { count } = await admin.from("external_assessment_delegates").select("id", { count: "exact", head: true }).eq("external_assessment_event_id", eventId);
  const { data, error } = await admin
    .from("external_assessment_delegates")
    .insert({
      external_assessment_event_id: eventId,
      sort_order: count ?? 0,
      full_name: fullName,
      title: body.title ? String(body.title).trim() || null : null,
      organization: body.organization ? String(body.organization).trim() || null : null,
      specialty_area: body.specialty_area ? String(body.specialty_area).trim() || null : null,
      phone: body.phone ? String(body.phone).trim() || null : null,
      host_name: body.host_name ? String(body.host_name).trim() || null : null,
      pickup_time: body.pickup_time ? String(body.pickup_time).trim() || null : null,
      pickup_location: body.pickup_location ? String(body.pickup_location).trim() || null : null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, delegate: data });
}
