import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.ok) return auth.response;

  const { id: templateId } = await params;
  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;

  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Tên nhóm mục là bắt buộc." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: template, error: templateError }, { data: version, error: versionError }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_templates").select("id,owner_department_id,is_active").eq("id", templateId).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", versionId).maybeSingle(),
  ]);

  if (callerError || !caller?.organization_id || !caller.is_active) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  }
  if (templateError || !template || !template.is_active) return NextResponse.json({ error: "Không tìm thấy mẫu bảng kiểm đang hoạt động." }, { status: 404 });
  if (versionError || !version || version.checklist_template_id !== templateId) return NextResponse.json({ error: "Phiên bản bảng kiểm không hợp lệ." }, { status: 400 });
  if (version.status !== "DRAFT") return NextResponse.json({ error: "Chỉ được chỉnh sửa phiên bản đang ở trạng thái Nháp." }, { status: 409 });

  if (!template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm chưa có đơn vị quản lý." }, { status: 400 });
  const { data: department } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!department || department.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const { data: last } = await admin.from("checklist_sections").select("sequence_no").eq("checklist_version_id", versionId).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
  const sequenceNo = Number(last?.sequence_no ?? 0) + 10;

  const { data: section, error } = await admin.from("checklist_sections").insert({
    checklist_version_id: versionId,
    title,
    description,
    sequence_no: sequenceNo,
  }).select("id,title,description,sequence_no").single();

  if (error || !section) return NextResponse.json({ error: error?.message || "Không tạo được nhóm mục." }, { status: 400 });
  return NextResponse.json({ ok: true, section });
}
