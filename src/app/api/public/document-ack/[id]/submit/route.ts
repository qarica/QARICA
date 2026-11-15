import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

// Route CÔNG KHAI — xác nhận "Tôi đã đọc và hiểu" KHÔNG đăng nhập, dành cho
// người nhận email ban hành toàn viện không có tài khoản QARICA. Chống nộp
// trùng theo mã NV đã chuẩn hoá (giống hệt /api/public/training-test/**) —
// chỉ so với các hàng xác nhận ẩn danh khác (user_id null) của CÙNG văn
// bản, không đụng tới xác nhận qua auth.uid() trong app.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const employeeName = String(body.employee_name || "").trim();
  const employeeCodeRaw = String(body.employee_code || "").trim();
  if (!employeeName) return NextResponse.json({ error: "Chưa nhập họ tên." }, { status: 400 });
  if (!employeeCodeRaw) return NextResponse.json({ error: "Chưa nhập mã nhân viên." }, { status: 400 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("document_publications")
    .select("id,organization_id,stage,dissemination_type")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });
  if (doc.stage !== "PUBLISHED" || doc.dissemination_type !== "SELF_READ") {
    return NextResponse.json({ error: "Văn bản này không áp dụng xác nhận tự đọc hiểu." }, { status: 403 });
  }

  const normalizedCode = normalizeEmployeeCode(employeeCodeRaw);
  const { data: existing } = await admin
    .from("document_publication_acknowledgments")
    .select("id,employee_code")
    .eq("document_publication_id", id)
    .is("user_id", null);
  const alreadyConfirmed = (existing ?? []).some((a) => a.employee_code && normalizeEmployeeCode(a.employee_code) === normalizedCode);
  if (alreadyConfirmed) return NextResponse.json({ error: "Mã nhân viên này đã xác nhận đọc hiểu văn bản này rồi." }, { status: 409 });

  const { error } = await admin.from("document_publication_acknowledgments").insert({
    organization_id: doc.organization_id,
    document_publication_id: id,
    employee_name: employeeName,
    employee_code: employeeCodeRaw,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
