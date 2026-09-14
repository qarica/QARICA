import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const [{ data: canView }, { data: canPerform }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "monitoring.view" }),
    supabase.rpc("has_permission", { p_permission_code: "monitoring.perform" }),
    supabase.rpc("has_permission", { p_permission_code: "checklists.manage" }),
  ]);
  if (!canView && !canPerform && !canManage) return NextResponse.json({ error: "Bạn không có quyền xem hình ảnh." }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: profile }, { data: evidence }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", user.id).maybeSingle(),
    admin.from("evidence").select("id,organization_id,storage_bucket,storage_path,mime_type").eq("id", id).maybeSingle(),
  ]);
  if (!profile?.is_active || !profile.organization_id) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!evidence || evidence.organization_id !== profile.organization_id || !evidence.storage_bucket || !evidence.storage_path) return NextResponse.json({ error: "Không tìm thấy hình ảnh." }, { status: 404 });

  // Route này chỉ phục vụ ảnh của module Giám sát. Không cho dùng quyền monitoring
  // để mở các file minh chứng của module khác trong cùng bệnh viện.
  if (!String(evidence.storage_path).includes("/monitoring/")) {
    return NextResponse.json({ error: "Hình ảnh không thuộc hồ sơ giám sát." }, { status: 403 });
  }

  const { data, error } = await admin.storage.from(evidence.storage_bucket).createSignedUrl(evidence.storage_path, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Không mở được hình ảnh." }, { status: 400 });
  return NextResponse.redirect(data.signedUrl);
}
