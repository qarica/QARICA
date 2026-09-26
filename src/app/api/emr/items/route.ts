import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  if (!category || !EMR_CATEGORIES.some((c) => c.code === category)) {
    return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("emr_rollout_items")
    .select("id,category,title,description,status,created_at,updated_at")
    .eq("organization_id", profile.organization_id)
    .eq("category", category)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const category = String(body.category || "");
  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const status = String(body.status || "TODO");

  if (!EMR_CATEGORIES.some((c) => c.code === category)) return NextResponse.json({ error: "Danh mục không hợp lệ." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Cần nhập tiêu đề." }, { status: 400 });
  if (!["TODO", "IN_PROGRESS", "DONE", "BLOCKED"].includes(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("emr_rollout_items")
    .insert({
      organization_id: profile.organization_id,
      category,
      title,
      description,
      status,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id,category,title,description,status,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, item: data });
}
