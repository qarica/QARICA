import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

// Route CÔNG KHAI — đăng ký slot tham gia đào tạo trước, không đăng nhập,
// cùng mẫu với /api/public/training-test (QR, service-role, không RLS cho
// anon). Đăng ký thuộc về đợt đào tạo (training_id); khi đợt đào tạo đã có
// buổi/đợt cụ thể (procedure_training_rounds — tái dùng nhãn này làm
// "buổi", không tạo bảng mới riêng), bắt buộc chọn 1 buổi để đăng ký, vì
// báo cáo thực tế "mỗi đợt đào tạo có nhiều buổi/ngày khác nhau, cần đăng
// ký theo từng buổi". Chưa có buổi nào thì vẫn đăng ký được bình thường
// (round_id null) — không ép phải tạo "đợt kiểm tra" trước mới mở đăng ký
// được.
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

  const [{ data: departments }, { data: rounds }] = await Promise.all([
    admin.from("departments").select("id,name").eq("organization_id", training.organization_id).eq("is_active", true).order("name"),
    admin.from("procedure_training_rounds").select("id,round_label").eq("training_id", trainingId).order("sort_order").order("round_date"),
  ]);

  return NextResponse.json({ ok: true, open: true, trainingName: training.procedure_name, departments: departments ?? [], rounds: rounds ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  const body = await request.json().catch(() => ({}));

  const employeeName = String(body.employee_name || "").trim();
  const employeeCodeRaw = String(body.employee_code || "").trim();
  const departmentId = String(body.department_id || "").trim();
  const jobTitle = String(body.job_title || "").trim();
  const roundId = String(body.round_id || "").trim();

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

  // Đợt đào tạo đã có buổi/đợt nào thì bắt buộc chọn 1 buổi khi đăng ký
  // ("mỗi đợt đào tạo có nhiều buổi/ngày khác nhau, cần đăng ký theo từng
  // buổi") — chưa có buổi nào thì bỏ qua, round_id để null.
  const { data: existingRounds } = await admin.from("procedure_training_rounds").select("id").eq("training_id", trainingId);
  let validatedRoundId: string | null = null;
  if (existingRounds && existingRounds.length) {
    if (!roundId) return NextResponse.json({ error: "Chưa chọn buổi/đợt đào tạo." }, { status: 400 });
    if (!existingRounds.some((r) => r.id === roundId)) return NextResponse.json({ error: "Buổi/đợt đào tạo không hợp lệ." }, { status: 400 });
    validatedRoundId = roundId;
  }

  // Chặn đăng ký trùng (cùng mã NV, cùng buổi/đợt — hoặc cùng đợt đào tạo
  // nếu chưa có buổi nào) — không chặn khi không có mã NV (đăng ký không
  // bắt buộc phải có sẵn mã, khác bắt buộc làm bài phải có mã để chống nộp
  // trùng kết quả).
  if (employeeCodeRaw) {
    const normalized = normalizeEmployeeCode(employeeCodeRaw);
    let query = admin.from("procedure_training_registrations").select("employee_code").eq("training_id", trainingId);
    query = validatedRoundId ? query.eq("round_id", validatedRoundId) : query.is("round_id", null);
    const { data: existing } = await query;
    const already = (existing ?? []).some((r) => r.employee_code && normalizeEmployeeCode(r.employee_code) === normalized);
    if (already) return NextResponse.json({ error: "Mã nhân viên này đã đăng ký buổi/đợt này rồi." }, { status: 409 });
  }

  const { data: created, error } = await admin
    .from("procedure_training_registrations")
    .insert({
      training_id: trainingId,
      organization_id: training.organization_id,
      round_id: validatedRoundId,
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
