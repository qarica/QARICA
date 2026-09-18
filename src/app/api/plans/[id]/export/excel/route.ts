import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPlanExportData } from "@/lib/plan-export-data";

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}
function nl(value: unknown) { return esc(value).replace(/\r?\n/g, "<br>"); }
function viDate(value: unknown) {
  const s = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y,m,d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 403 });

  try {
    const data = await loadPlanExportData(id, caller.organization_id);
    const rows = data.tasks.map((t:any, i:number)=>`<tr><td>${i+1}</td><td>${nl(t.title)}</td><td>${nl(t.expectedResult)}</td><td>${viDate(t.startDate)}</td><td>${viDate(t.dueDate)}</td></tr>`).join("");
    const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #777;padding:5px;vertical-align:top;white-space:pre-wrap}th{background:#e5e7eb;font-weight:bold}.meta td:first-child{font-weight:bold;background:#f3f4f6}
    </style></head><body>
      <table class="meta"><tr><td>Mã kế hoạch</td><td>${esc(data.record.record_code)}</td></tr><tr><td>Tên kế hoạch</td><td>${esc(data.record.title)}</td></tr><tr><td>Năm</td><td>${esc(data.record.work_year)}</td></tr><tr><td>Khoa/phòng chủ trì</td><td>${esc(data.departmentName)}</td></tr><tr><td>Người phụ trách</td><td>${esc(data.ownerName)}</td></tr></table><br>
      <table><thead><tr><th>STT</th><th>Nội dung nhiệm vụ</th><th>Kết quả kỳ vọng</th><th>Ngày bắt đầu</th><th>Hạn hoàn thành</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Chưa có nhiệm vụ.</td></tr>'}</tbody></table>
    </body></html>`;
    const safe = String(data.record.record_code || "ke-hoach").replace(/[^A-Za-z0-9._-]+/g, "_");
    return new NextResponse(html, { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.xls"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không xuất được Excel." }, { status: 400 });
  }
}
