import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// "Tự đọc hiểu": từng nhân viên tự bấm xác nhận đã đọc & hiểu — chỉ cần
// document_publication.view (ai xem được văn bản cũng tự xác nhận được cho
// chính mình), không cần quyền quản lý. Danh tính lấy từ auth.uid(), không
// yêu cầu nhập tay tên/mã NV/email như phiếu khảo sát giấy trước đây.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await admin
    .from("document_publications")
    .select("id,stage,dissemination_type")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });
  if (doc.stage !== "PUBLISHED" || doc.dissemination_type !== "SELF_READ") {
    return NextResponse.json({ error: "Văn bản này không áp dụng xác nhận tự đọc hiểu." }, { status: 400 });
  }

  const { data: profile } = await admin.from("profiles").select("primary_department_id").eq("user_id", auth.user.id).maybeSingle();

  const { error } = await admin
    .from("document_publication_acknowledgments")
    .upsert(
      {
        organization_id: organizationId,
        document_publication_id: id,
        user_id: auth.user.id,
        department_id: profile?.primary_department_id ?? null,
      },
      { onConflict: "document_publication_id,user_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
