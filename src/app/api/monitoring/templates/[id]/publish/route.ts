import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const PUBLISH_RPC = "qlcl_publish_checklist_version_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: template }, { data: version }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,organization_id,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", versionId).maybeSingle(),
  ]);

  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!template || !template.is_active) return NextResponse.json({ error: "Không tìm thấy mẫu bảng kiểm đang hoạt động." }, { status: 404 });
  if (template.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });
  if (!version || version.checklist_template_id !== templateId) return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 400 });
  if (version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được phát hành phiên bản đang ở trạng thái Nháp." }, { status: 409 });

  if (!template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm chưa có đơn vị quản lý." }, { status: 400 });
  const { data: department } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!department || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Đơn vị quản lý bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const [{ count: sectionCount }, { count: itemCount }] = await Promise.all([
    admin.from("checklist_sections").select("id", { count: "exact", head: true }).eq("checklist_version_id", versionId),
    admin.from("checklist_items").select("id", { count: "exact", head: true }).eq("checklist_version_id", versionId),
  ]);
  if (!sectionCount || !itemCount) return NextResponse.json({ error: "Phiên bản chưa có đầy đủ nhóm mục và tiêu chí để phát hành." }, { status: 409 });

  const publishedAt = new Date().toISOString();
  const { data: result, error } = await admin.rpc(PUBLISH_RPC, {
    p_template_id: templateId,
    p_version_id: versionId,
    p_organization_id: caller.organization_id,
    p_actor_user_id: auth.user.id,
    p_published_at: publishedAt,
  });

  if (error) {
    const message = rpcErrorMessage(error, "Không thể phát hành phiên bản bảng kiểm.");
    const status = /draft|section|item|race/i.test(message) ? 409 : /organization|outside/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const { data: published } = await admin
    .from("checklist_versions")
    .select("id,status,published_at,effective_from")
    .eq("id", versionId)
    .maybeSingle();

  if (!published || published.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Phiên bản chưa được phát hành thành công." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, version: published, transaction: "atomic", result: result ?? null });
}
