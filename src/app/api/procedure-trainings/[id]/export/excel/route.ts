import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePassStatus } from "@/lib/procedure-training-pass-status";
import { formatCheckInTime } from "@/lib/procedure-training-check-in-time";

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}

const PASS_STATUS_LABEL: Record<string, string> = { pass: "Đạt", fail: "Không đạt — cần học lại", none: "—" };

// Xuất Excel kết quả test (báo cáo thực tế: "bổ sung xuất excel kết quả
// test") — chỉ đọc (permission .view), cùng mẫu HTML-table-as-.xls đã dùng
// ở api/plans/[id]/export/excel và api/emr/items/export (Excel mở trực tiếp
// được qua Content-Type application/vnd.ms-excel, không cần thư viện sinh
// file nhị phân riêng). Đạt/Không đạt tính bằng CHÍNH computePassStatus
// dùng chung với UI (src/lib/procedure-training-pass-status.ts) — không
// tính lại logic lần 2 có nguy cơ lệch so với màn hình (CLAUDE.md nguyên
// tắc 2 và 5: đối chiếu UI↔export).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin
    .from("procedure_trainings")
    .select("id,procedure_name,pass_threshold,test_score_max")
    .eq("id", trainingId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy đợt đào tạo." }, { status: 404 });

  const [roundsRes, attendeesRes] = await Promise.all([
    admin.from("procedure_training_rounds").select("id,round_label,round_date,score_max,sort_order").eq("training_id", trainingId).order("sort_order").order("round_date"),
    admin.from("procedure_training_attendees").select("id,employee_name,employee_code,department,job_title,attended,checked_in_at").eq("training_id", trainingId).order("employee_name"),
  ]);
  // "+ Thêm đợt" không có ô nhập thang điểm riêng — round.score_max gần như
  // luôn null trên dữ liệu thật, chỉ training.test_score_max mới thật sự
  // được điền; lấy thang điểm đợt nếu có, không thì dùng mặc định của đợt
  // đào tạo (cùng fallback với UI — xem procedure-training-detail-client.tsx).
  const rounds = (roundsRes.data ?? []).map((r) => ({ ...r, score_max: r.score_max ?? training.test_score_max }));
  const attendees = attendeesRes.data ?? [];

  const attendeeIds = attendees.map((a) => a.id);
  const { data: resultRows } = attendeeIds.length
    ? await admin.from("procedure_training_results").select("attendee_id,round_id,score").in("attendee_id", attendeeIds)
    : { data: [] as { attendee_id: string; round_id: string; score: number | null }[] };
  const resultsByAttendee = new Map<string, { round_id: string; score: number | null }[]>();
  for (const r of resultRows ?? []) resultsByAttendee.set(r.attendee_id, [...(resultsByAttendee.get(r.attendee_id) || []), { round_id: r.round_id, score: r.score }]);

  const showPassColumn = training.pass_threshold != null && rounds.length > 0;
  const roundHeaders = rounds.map((r) => `<th>${esc(r.round_label)}${r.score_max ? ` (/${r.score_max})` : ""}</th>`).join("");
  const colCount = 7 + rounds.length + (showPassColumn ? 1 : 0);

  const rows = attendees
    .map((a, i) => {
      const myResults = resultsByAttendee.get(a.id) || [];
      const roundCells = rounds
        .map((r) => {
          const score = myResults.find((res) => res.round_id === r.id && res.score != null)?.score;
          return `<td>${score != null ? esc(score) : "—"}</td>`;
        })
        .join("");
      const passCell = showPassColumn ? `<td>${esc(PASS_STATUS_LABEL[computePassStatus(myResults, rounds, training.pass_threshold, a.attended)])}</td>` : "";
      return `<tr><td>${i + 1}</td><td>${esc(a.employee_name)}</td><td>${esc(a.employee_code || "")}</td><td>${esc(a.department || "")}</td><td>${esc(a.job_title || "")}</td><td>${a.attended ? "Có" : "Không"}</td><td>${esc(formatCheckInTime(a.checked_in_at))}</td>${roundCells}${passCell}</tr>`;
    })
    .join("");

  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #777;padding:5px;vertical-align:top;white-space:pre-wrap}th{background:#e5e7eb;font-weight:bold}
    </style></head><body>
      <table>
        <thead><tr><th>STT</th><th>Họ tên</th><th>Mã NV</th><th>Đơn vị</th><th>Chức danh</th><th>Đã điểm danh</th><th>Giờ quét QR</th>${roundHeaders}${showPassColumn ? "<th>Kết quả</th>" : ""}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${colCount}">Chưa có dữ liệu.</td></tr>`}</tbody>
      </table>
    </body></html>`;

  const safe = String(training.procedure_name || "ket-qua-dao-tao").replace(/[^A-Za-z0-9._-]+/g, "_");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}
