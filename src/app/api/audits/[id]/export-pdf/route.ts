import { NextResponse } from "next/server";
import { createVietnamesePdf, drawWrappedText } from "@/lib/pdf/vietnamese-pdf";
import { createClient } from "@/lib/supabase/server";
import { rgb } from "pdf-lib";

// Xuất PDF tổng hợp 1 cuộc Audit/Tracer: thông tin chung + danh sách Finding
// liên kết — dùng làm phiếu tóm tắt khi tiếp đoàn kiểm tra. Đây là bản tóm tắt
// dựng bằng pdf-lib (không phải in nguyên trang web như /audits/[id]/print),
// nên chỉ gồm các trường cốt lõi; xem docs/DATA_DICTIONARY.md để biết đầy đủ
// trường của "audits". Font tiếng Việt: xem ghi chú trong src/lib/pdf/vietnamese-pdf.ts
// trước khi sửa (subset:false bắt buộc, đã kiểm chứng bằng ảnh render thật).

const SEVERITY_LABEL: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", CRITICAL: "Nghiêm trọng" };
const STATUS_LABEL: Record<string, string> = { OPEN: "Đang mở", IN_PROGRESS: "Đang xử lý", CLOSED: "Đã đóng", VERIFIED: "Đã xác minh" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: record } = await supabase.from("records").select("id,record_code,title").eq("id", recordId).eq("record_type", "AUDIT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy Audit hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data: audit } = await supabase
    .from("audits")
    .select("id,audit_type,objective,start_date,end_date,workflow_status,lead_auditor_id")
    .eq("record_id", recordId)
    .maybeSingle();
  if (!audit) return NextResponse.json({ error: "Không tìm thấy dữ liệu Audit." }, { status: 404 });

  const [{ data: links }, { data: leadAuditor }] = await Promise.all([
    supabase.from("audit_finding_links").select("finding_id").eq("audit_id", audit.id),
    audit.lead_auditor_id ? supabase.from("profiles").select("full_name,email").eq("user_id", audit.lead_auditor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const findingIds = Array.from(new Set((links ?? []).map((l: any) => l.finding_id).filter(Boolean)));
  const { data: findings } = findingIds.length
    ? await supabase.from("findings").select("description,severity,workflow_status,due_date").in("id", findingIds)
    : { data: [] as any[] };

  const { doc, regular, bold } = await createVietnamesePdf();
  const page = doc.addPage([595.28, 841.89]); // A4
  const marginX = 48;
  let y = 800;

  page.drawText("PHIẾU TỔNG HỢP AUDIT / TRACER", { x: marginX, y, size: 16, font: bold });
  y -= 24;
  page.drawText(`${record.record_code} · ${record.title}`, { x: marginX, y, size: 11, font: regular, color: rgb(0.3, 0.3, 0.3) });
  y -= 28;

  const fields: [string, string][] = [
    ["Loại Audit / Tracer", audit.audit_type || "—"],
    ["Trạng thái", STATUS_LABEL[String(audit.workflow_status)] || String(audit.workflow_status || "—")],
    ["Bắt đầu", audit.start_date || "—"],
    ["Kết thúc", audit.end_date || "—"],
    ["Trưởng đoàn/phụ trách", (leadAuditor as any)?.full_name || (leadAuditor as any)?.email || "Chưa gán"],
  ];
  for (const [label, value] of fields) {
    page.drawText(`${label}:`, { x: marginX, y, size: 10, font: bold });
    page.drawText(String(value), { x: marginX + 150, y, size: 10, font: regular });
    y -= 16;
  }
  y -= 6;
  if (audit.objective) {
    page.drawText("Mục tiêu:", { x: marginX, y, size: 10, font: bold });
    y -= 14;
    y = drawWrappedText(page, regular, audit.objective, { x: marginX, y, size: 10, maxWidth: 595.28 - marginX * 2 });
    y -= 10;
  }

  y -= 8;
  page.drawText(`Finding liên kết (${(findings ?? []).length})`, { x: marginX, y, size: 12, font: bold });
  y -= 20;

  if (!findings || !findings.length) {
    page.drawText("Chưa có Finding nào được liên kết với cuộc Audit này.", { x: marginX, y, size: 10, font: regular, color: rgb(0.4, 0.4, 0.4) });
  } else {
    for (const f of findings as any[]) {
      if (y < 90) { y = 800; doc.addPage([595.28, 841.89]); }
      const tag = `[${SEVERITY_LABEL[String(f.severity)] || f.severity || "—"} · ${STATUS_LABEL[String(f.workflow_status)] || f.workflow_status || "—"}${f.due_date ? ` · Hạn ${f.due_date}` : ""}]`;
      page.drawText(tag, { x: marginX, y, size: 9, font: bold, color: rgb(0.55, 0.15, 0.15) });
      y -= 13;
      y = drawWrappedText(page, regular, f.description || "(chưa có mô tả)", { x: marginX, y, size: 10, maxWidth: 595.28 - marginX * 2 });
      y -= 12;
    }
  }

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="audit-${record.record_code}.pdf"`,
    },
  });
}
