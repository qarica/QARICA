import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Route CÔNG KHAI — dán link này vào email ban hành toàn viện, nhân viên
// không có tài khoản QARICA vẫn xác nhận được. Dùng createAdminClient
// (service role, bỏ qua RLS) như mọi route public khác trong app — không
// thêm RLS cho anon, mọi kiểm tra nằm ở code API.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from("document_publications")
    .select("id,organization_id,title,document_code,version_label,stage,dissemination_type")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const open = doc.stage === "PUBLISHED" && doc.dissemination_type === "SELF_READ";
  // Danh sách khoa/phòng thật của tổ chức — để người xác nhận CHỌN, không tự
  // gõ tay (tránh sai chính tả/trùng tên làm hỏng dữ liệu báo cáo).
  const { data: departments } = open
    ? await admin.from("departments").select("id,name").eq("organization_id", doc.organization_id).eq("is_active", true).order("name")
    : { data: [] as { id: string; name: string }[] };

  return NextResponse.json({
    ok: true,
    open,
    title: doc.title,
    documentCode: doc.document_code,
    versionLabel: doc.version_label,
    departments: departments ?? [],
  });
}
