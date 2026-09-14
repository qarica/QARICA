import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("tasks.view");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { data: evidence, error } = await auth.supabase
    .from("evidence")
    .select("id,storage_bucket,storage_path,external_url,original_file_name,title")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!evidence) return NextResponse.json({ error: "Không tìm thấy minh chứng hoặc bạn không có quyền truy cập." }, { status: 404 });

  if (evidence.external_url && !evidence.storage_path) {
    return NextResponse.redirect(evidence.external_url);
  }
  if (!evidence.storage_bucket || !evidence.storage_path) {
    return NextResponse.json({ error: "Minh chứng chưa có file lưu trữ." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error: signedError } = await admin.storage
    .from(evidence.storage_bucket)
    .createSignedUrl(evidence.storage_path, 60, {
      download: evidence.original_file_name || evidence.title || true,
    });

  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || "Không tạo được đường dẫn tải minh chứng." }, { status: 400 });
  }

  return NextResponse.redirect(data.signedUrl);
}
