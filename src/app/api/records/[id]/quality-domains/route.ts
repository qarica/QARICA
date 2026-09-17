import { NextResponse } from "next/server";
import { actionCreatePermissions } from "@/lib/source-action-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getContext(recordId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) } as const;
  const { data: record, error: recordError } = await supabase
    .from("records")
    .select("id,organization_id,record_type,lifecycle_status")
    .eq("id", recordId)
    .maybeSingle();
  if (recordError || !record) return { error: NextResponse.json({ error: recordError?.message || "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 }) } as const;
  return { supabase, user, record } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext(id);
  if ("error" in ctx) return ctx.error;
  const admin = createAdminClient();
  const [{ data: domains, error: domainError }, { data: links, error: linkError }] = await Promise.all([
    admin.from("quality_domains")
      .select("id,organization_id,code,name,description,sort_order,is_active")
      .or(`organization_id.is.null,organization_id.eq.${ctx.record.organization_id}`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin.from("record_quality_domain_links").select("domain_id").eq("record_id", id),
  ]);
  if (domainError || linkError) return NextResponse.json({ error: domainError?.message || linkError?.message || "Không tải được lĩnh vực chất lượng/an toàn." }, { status: 400 });
  return NextResponse.json({
    domains: domains ?? [],
    selected_domain_ids: (links ?? []).map((row: any) => String(row.domain_id)),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext(id);
  if ("error" in ctx) return ctx.error;
  if (ctx.record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Chỉ được cập nhật phân loại khi hồ sơ đang hoạt động." }, { status: 409 });

  const permissions = actionCreatePermissions(ctx.record.record_type);
  if (!permissions.length) return NextResponse.json({ error: "Loại hồ sơ này chưa hỗ trợ phân loại lĩnh vực dùng chung." }, { status: 403 });
  const checks = await Promise.all(permissions.map((permission) => ctx.supabase.rpc("has_permission", { p_permission_code: permission })));
  if (!checks.some((result) => result.data === true)) return NextResponse.json({ error: "Bạn chưa có quyền cập nhật phân loại cho hồ sơ này." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const domainIds = Array.from(new Set((Array.isArray(body.domain_ids) ? body.domain_ids : []).map((value: unknown) => String(value || "").trim()).filter(Boolean)));
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("qlcl_set_record_quality_domains_v1", {
    p_record_id: id,
    p_actor_user_id: ctx.user.id,
    p_domain_ids: domainIds,
  });
  if (error) return NextResponse.json({ error: error.message || "Không cập nhật được lĩnh vực chất lượng/an toàn." }, { status: 409 });
  return NextResponse.json({ ok: true, count: data ?? domainIds.length });
}
