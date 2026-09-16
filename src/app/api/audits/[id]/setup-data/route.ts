import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "audit.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý Audit/Tracer." }, { status: 403 });

  const { id: recordId } = await params;
  const { data: record } = await supabase.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "AUDIT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy Audit hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Audit không còn hoạt động." }, { status: 409 });

  const { data: audit } = await supabase.from("audits").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
  if (!audit) return NextResponse.json({ error: "Không tìm thấy dữ liệu Audit." }, { status: 404 });
  const [{ data: scopes }, { data: sessions }] = await Promise.all([
    supabase.from("audit_scopes").select("id,department_id,process_name,area_name,scope_description").eq("audit_id", audit.id).order("id"),
    supabase.from("audit_sessions").select("id,scheduled_start,scheduled_end,department_id,location,session_status").eq("audit_id", audit.id).order("scheduled_start"),
  ]);
  return NextResponse.json({ status: audit.workflow_status, scopes: scopes ?? [], sessions: sessions ?? [] });
}
