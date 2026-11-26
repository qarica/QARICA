import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

// Route CÔNG KHAI — đăng ký tham gia 1 LỚP đào tạo trước, không đăng nhập,
// cùng mẫu với /api/public/training-test (QR, service-role, không RLS cho
// anon). "Khai báo lớp -> đăng ký chọn lớp -> test theo lớp" — đăng ký chỉ
// để xác nhận tham gia LỚP này (training_id), KHÔNG chọn Pre-test/Post-test
// ở đây: Pre-test chỉ vào được qua đúng mã QR riêng của đợt kiểm tra đó
// (đầu buổi), tách khỏi đăng ký — không phải lúc nào cũng làm Pre-test nhưng
// luôn phải làm Post-test.
export async function GET(_request: Request, { params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  const admin = createAdminClient();

  const { data: training } = await admin
    .from("procedure_trainings")
    .select("id,organization_id,procedure_name,is_open_for_registration")
    .eq("id", trainingId)
    .maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy đợt đào tạo." }, { status: 404 });

  if (!training.is_open_for_registration) {
    return NextResponse.json({ ok: true, open: false, trainingName: training.procedure_name });
  }

  const { data: departments } = await admin.from("departments").select("id,name").eq("organization_id", training.organization_id).eq("is_active", true).order("name");

  return NextResponse.json({ ok: true, open: true, trainingName: training.procedure_name, departments: departments ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  const body = await request.json().catch(() => ({}));

  const employeeName = String(body.employee_name || "").trim();
  const employeeCodeRaw = String(body.employee_code || "").trim();
  const departmentId = String(body.department_id || "").trim();
  const jobTitle = String(body.job_title || "").trim();

  if (!employeeName) return NextResponse.json({ error: "Chưa nhập họ tên." }, { status: 400 });

  const admin = createAdminClient();
  const { data: training } = await admin.from("procedure_trainings").select("id,organization_id,is_open_for_registration").eq("id", trainingId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy đợt đào tạo." }, { status: 404 });
  if (!training.is_open_for_registration) return NextResponse.json({ error: "Đợt đào tạo hiện chưa mở đăng ký." }, { status: 403 });

  let departmentName: string | null = null;
  if (departmentId) {
    const { data: department } = await admin.from("departments").select("id,name").eq("id", departmentId).eq("organization_id", training.organization_id).maybeSingle();
    if (!department) return NextResponse.json({ error: "Đơn vị công tác không hợp lệ." }, { status: 400 });
    departmentName = department.name;
  }

  // Chặn đăng ký trùng (cùng mã NV, cùng LỚP — ko còn phân theo buổi/đợt
  // kiểm tra vì đăng ký chỉ còn là "tham gia lớp này", không chọn Pre/Post)
  // — không chặn khi không có mã NV (đăng ký không bắt buộc phải có sẵn mã,
  // khác bắt buộc làm bài phải có mã để chống nộp trùng kết quả).
  if (employeeCodeRaw) {
    const normalized = normalizeEmployeeCode(employeeCodeRaw);
    const { data: existing } = await admin.from("procedure_training_registrations").select("employee_code").eq("training_id", trainingId);
    const already = (existing ?? []).some((r) => r.employee_code && normalizeEmployeeCode(r.employee_code) === normalized);
    if (already) return NextResponse.json({ error: "Mã nhân viên này đã đăng ký lớp này rồi." }, { status: 409 });
  }

  const { data: created, error } = await admin
    .from("procedure_training_registrations")
    .insert({
      training_id: trainingId,
      organization_id: training.organization_id,
      round_id: null,
      employee_name: employeeName,
      employee_code: employeeCodeRaw || null,
      department: departmentName,
      job_title: jobTitle || null,
    })
    .select("id,employee_name,department,job_title,registered_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, registration: created });
}
