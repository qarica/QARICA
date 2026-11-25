import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { namesMatch } from "@/lib/training-import";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

// Route CÔNG KHAI — nhân viên quét QR để ĐIỂM DANH lớp tập huấn, không đăng nhập (cùng mẫu
// với /api/public/training-test và /api/public/training-registration: service-role, không
// RLS cho anon, toàn bộ kiểm tra tenant/trạng thái mở nằm ở code API). "Chưa cần làm
// test": điểm danh KHÔNG tạo kết quả/bài làm nào, chỉ đánh dấu attended trên
// procedure_training_attendees có sẵn (một nghiệp vụ chỉ một nguồn sự thật — không có bảng
// điểm danh thứ hai). KHÔNG trả danh sách người tham dự ra ngoài trong bất kỳ trường hợp nào.
export async function GET(_request: Request, { params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  const admin = createAdminClient();

  const { data: training } = await admin
    .from("procedure_trainings")
    .select("id,organization_id,procedure_name,is_open_for_attendance")
    .eq("id", trainingId)
    .maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy lớp tập huấn." }, { status: 404 });

  if (!training.is_open_for_attendance) {
    return NextResponse.json({ ok: true, open: false, trainingName: training.procedure_name });
  }

  // Chọn khoa/phòng từ danh sách thật (tránh sai chính tả/trùng tên khi tự gõ) — như trang đăng ký.
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
  if (employeeName.length > 200) return NextResponse.json({ error: "Họ tên quá dài." }, { status: 400 });

  const admin = createAdminClient();
  const { data: training } = await admin.from("procedure_trainings").select("id,organization_id,is_open_for_attendance").eq("id", trainingId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy lớp tập huấn." }, { status: 404 });
  if (!training.is_open_for_attendance) return NextResponse.json({ error: "Lớp tập huấn hiện chưa mở điểm danh." }, { status: 403 });

  // department_id do client gửi — xác minh thuộc đúng tổ chức của lớp trước khi dùng (route công khai).
  let departmentName: string | null = null;
  if (departmentId) {
    const { data: department } = await admin.from("departments").select("id,name").eq("id", departmentId).eq("organization_id", training.organization_id).maybeSingle();
    if (!department) return NextResponse.json({ error: "Đơn vị công tác không hợp lệ." }, { status: 400 });
    departmentName = department.name;
  }

  // Tìm người đã có trong lớp: ưu tiên mã NV đã chuẩn hoá, sau đó tên (bỏ dấu, hoa/thường, chức danh
  // viết tắt) — cùng cách khớp với route tự làm bài, để người đã được nhập tay/import không bị tạo trùng.
  const normalizedCode = employeeCodeRaw ? normalizeEmployeeCode(employeeCodeRaw) : null;
  const { data: existing } = await admin
    .from("procedure_training_attendees")
    .select("id,employee_name,employee_code,department,job_title,attended,attended_at,checked_in_at")
    .eq("training_id", trainingId);
  const matchedByCode = normalizedCode ? (existing ?? []).find((a) => a.employee_code && normalizeEmployeeCode(a.employee_code) === normalizedCode) : undefined;
  const matched = matchedByCode ?? (existing ?? []).find((a) => namesMatch(a.employee_name, employeeName));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (matched) {
    // Quét lại (bấm đúp/quét 2 lần): không làm gì thêm, báo rõ đã điểm danh — an toàn khi gọi lặp.
    if (matched.attended) {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true, attendee: { employee_name: matched.employee_name, department: matched.department, job_title: matched.job_title, checked_in_at: matched.checked_in_at } });
    }
    const patch: Record<string, unknown> = { attended: true, attended_at: today, checked_in_at: now.toISOString(), updated_at: now.toISOString() };
    // Bổ sung đơn vị/chức danh còn thiếu từ lần quét, KHÔNG ghi đè dữ liệu đã có.
    if (!matched.department && departmentName) patch.department = departmentName;
    if (!matched.job_title && jobTitle) patch.job_title = jobTitle;
    const { error } = await admin.from("procedure_training_attendees").update(patch).eq("id", matched.id).eq("training_id", trainingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, alreadyCheckedIn: false, attendee: { employee_name: matched.employee_name, department: (patch.department as string) ?? matched.department, job_title: (patch.job_title as string) ?? matched.job_title, checked_in_at: patch.checked_in_at } });
  }

  const { data: created, error: insertError } = await admin
    .from("procedure_training_attendees")
    .insert({
      training_id: trainingId,
      organization_id: training.organization_id,
      employee_name: employeeName,
      employee_code: employeeCodeRaw || null,
      department: departmentName,
      job_title: jobTitle || null,
      attended: true,
      attended_at: today,
      checked_in_at: now.toISOString(),
    })
    .select("employee_name,department,job_title,checked_in_at")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
  return NextResponse.json({ ok: true, alreadyCheckedIn: false, attendee: created });
}
