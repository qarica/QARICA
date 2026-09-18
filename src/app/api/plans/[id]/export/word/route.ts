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
    const specifics = data.specifics.length ? `<ol>${data.specifics.map((x:string)=>`<li>${nl(x)}</li>`).join("")}</ol>` : "";
    const requirements = String(data.program.requirements || "").trim();
    const rows = data.tasks.map((t:any, i:number)=>`<tr><td>${i+1}</td><td>${nl(t.title)}</td><td>${nl(t.expectedResult)}</td><td>${viDate(t.startDate)}</td><td>${viDate(t.dueDate)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.5;color:#111}
      h1{text-align:center;font-size:18pt;text-transform:uppercase}h2{font-size:13pt;margin-top:18px}
      table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #777;padding:6px;vertical-align:top}th{background:#eee}
      .meta{margin:10px 0}.pre{white-space:pre-wrap}
    </style></head><body>
      <h1>KẾ HOẠCH</h1><h1>${esc(data.record.title)}</h1>
      <div class="meta"><strong>Mã:</strong> ${esc(data.record.record_code)} &nbsp; <strong>Năm:</strong> ${esc(data.record.work_year)}</div>
      <div class="meta"><strong>Thời gian:</strong> ${viDate(data.program.start_date)} – ${viDate(data.program.end_date)}</div>
      <div class="meta"><strong>Khoa/phòng chủ trì:</strong> ${esc(data.departmentName || "—")}</div>
      <div class="meta"><strong>Người phụ trách:</strong> ${esc(data.ownerName || "—")}</div>
      <h2>I. Mục tiêu chung</h2><div class="pre">${nl(data.program.general_objective || data.program.description || "")}</div>
      ${specifics ? `<h2>II. Mục tiêu cụ thể</h2>${specifics}` : ""}
      ${requirements ? `<h2>Yêu cầu</h2><div class="pre">${nl(requirements)}</div>` : ""}
      <h2>Danh sách nhiệm vụ</h2>
      <table><thead><tr><th>STT</th><th>Nội dung</th><th>Kết quả kỳ vọng</th><th>Ngày bắt đầu</th><th>Hạn hoàn thành</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Chưa có nhiệm vụ.</td></tr>'}</tbody></table>
    </body></html>`;
    const safe = String(data.record.record_code || "ke-hoach").replace(/[^A-Za-z0-9._-]+/g, "_");
    return new NextResponse(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.doc"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không xuất được Word." }, { status: 400 });
  }
}
