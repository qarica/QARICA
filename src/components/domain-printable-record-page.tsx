import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrowserPrintButton } from "@/components/browser-print-button";
import { DomainRecordDetail } from "@/components/domain-record-detail";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function DomainPrintableRecordPage({ id, recordType, title, backHref, permissions }: { id: string; recordType: string; title: string; backHref: string; permissions: string[] }) {
  const { user, organization } = await requireUserContext();
  if (!hasAnyPermission(user, permissions)) redirect("/dashboard?forbidden=1");
  const supabase = await createClient();
  const { data: record } = await supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at,closed_at").eq("id", id).eq("record_type", recordType).maybeSingle();
  if (!record) notFound();
  const [departmentResult, ownerResult] = await Promise.all([
    record.owner_department_id ? supabase.from("departments").select("name,short_name").eq("id", record.owner_department_id).maybeSingle() : Promise.resolve({ data: null }),
    record.owner_user_id ? supabase.from("profiles").select("full_name,email").eq("user_id", record.owner_user_id).maybeSingle() : Promise.resolve({ data: null }),
  ] as any);
  const department = departmentResult.data;
  const owner = ownerResult.data;
  const generatedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  return <div className="domain-print-page">
    <style>{`
      .domain-print-page{max-width:980px;margin:0 auto;background:#fff;color:#111827;padding:26px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
      .dpp-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:18px;flex-wrap:wrap}.dpp-toolbar a{text-decoration:none;color:#0f766e;font-weight:750}.dpp-print{border:1px solid #0f766e;background:#0f766e;color:#fff;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:750;cursor:pointer}
      .dpp-head{display:grid;grid-template-columns:1fr auto;gap:18px;border-bottom:2px solid #0f766e;padding-bottom:14px;margin-bottom:16px}.dpp-org{font-size:13px;font-weight:800;text-transform:uppercase}.dpp-title{font-size:23px;font-weight:900;margin-top:6px}.dpp-code{text-align:right;font-weight:850;font-size:14px}.dpp-code small{display:block;font-weight:600;color:#64748b;margin-top:4px}
      .dpp-meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d7dee8;border-bottom:0;margin-bottom:16px}.dpp-meta>div{display:grid;grid-template-columns:145px 1fr;min-height:42px;border-bottom:1px solid #d7dee8}.dpp-meta>div:nth-child(odd){border-right:1px solid #d7dee8}.dpp-meta span{padding:9px;background:#f8fafc;color:#475569;font-size:12px;border-right:1px solid #d7dee8}.dpp-meta strong{padding:9px;font-size:12px;white-space:pre-wrap;font-weight:650}
      .domain-print-page .panel{box-shadow:none!important;border:1px solid #d7dee8!important;break-inside:avoid}.domain-print-page .panel-title{background:#ecfdf5!important;border-bottom:1px solid #d7dee8!important}.domain-print-page .domain-detail-panel{margin-bottom:14px}.domain-print-page .domain-detail-panel h2{font-size:15px}.domain-print-page .domain-field span{font-size:11px}.domain-print-page .domain-field strong{font-size:12px;white-space:pre-wrap}
      .dpp-note{font-size:10px;color:#64748b;line-height:1.45;margin-top:14px}.dpp-footer{margin-top:24px;padding-top:10px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;gap:20px;font-size:10px;color:#64748b}
      @media(max-width:760px){.domain-print-page{padding:15px}.dpp-head{grid-template-columns:1fr}.dpp-code{text-align:left}.dpp-meta{grid-template-columns:1fr}.dpp-meta>div:nth-child(odd){border-right:0}.dpp-meta>div{grid-template-columns:125px 1fr}}
      @media print{@page{size:A4;margin:12mm}body{background:#fff!important}.sidebar,.topbar,.workspace-strip,.mobile-bottom-nav,.global-back-bar,.route-progress,.no-print{display:none!important}.main-shell{margin:0!important;padding:0!important}.content{padding:0!important;margin:0!important;max-width:none!important}.domain-print-page{box-shadow:none!important;max-width:none!important;margin:0!important;padding:0!important}.domain-print-page .panel{break-inside:avoid}.domain-print-page .domain-detail-grid{grid-template-columns:1fr 1fr!important}.domain-print-page .domain-field.wide{grid-column:1/-1!important}}
    `}</style>
    <div className="dpp-toolbar no-print"><Link href={`${backHref}/${id}`}>← Quay lại hồ sơ</Link><BrowserPrintButton /></div>
    <header className="dpp-head"><div><div className="dpp-org">{organization?.name || "HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG"}</div><div className="dpp-title">{title}</div></div><div className="dpp-code">{record.record_code}<small>Năm {record.work_year}</small></div></header>
    <section className="dpp-meta">
      <div><span>Tên hồ sơ</span><strong>{record.title}</strong></div><div><span>Registry</span><strong>{record.lifecycle_status}</strong></div>
      <div><span>Đơn vị phụ trách</span><strong>{department?.short_name || department?.name || "—"}</strong></div><div><span>Người phụ trách</span><strong>{owner?.full_name || owner?.email || "Chưa gán"}</strong></div>
      <div><span>Tạo lúc</span><strong>{formatDateTime(record.created_at)}</strong></div><div><span>Cập nhật</span><strong>{formatDateTime(record.updated_at)}</strong></div>
      {record.closed_at ? <div><span>Đóng lúc</span><strong>{formatDateTime(record.closed_at)}</strong></div> : null}
    </section>
    <DomainRecordDetail recordType={record.record_type} recordId={record.id}/>
    <p className="dpp-note">Bản in này lấy trực tiếp từ dữ liệu hồ sơ điện tử mà tài khoản hiện tại được phép truy cập. Hệ thống không tự suy diễn dữ liệu thiếu; các trường trống hiển thị theo trạng thái dữ liệu gốc.</p>
    <footer className="dpp-footer"><span>Xuất lúc: {generatedAt}</span><span>Người xuất: {user.fullName || user.email}</span></footer>
  </div>;
}
