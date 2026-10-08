import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).slice(0, 7);
}

export default async function HsbaReportPage({ searchParams }: { searchParams: Promise<{ period?: string; type?: string }> }) {
  const { user } = await requireUserContext();
  const { period: rawPeriod, type } = await searchParams;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(rawPeriod)) ? String(rawPeriod) : currentPeriod();
  const auditType = normalizeInternalAuditType(type);
  const supabase = await createClient();

  const [auditsRes, departmentsRes] = await Promise.all([
    supabase
      .from("hsba_audits")
      .select("id,department_id,overall_result")
      .eq("organization_id", user.organizationId)
      .eq("audit_type", auditType)
      .eq("period", period),
    supabase.from("departments").select("id,name"),
  ]);

  const audits = auditsRes.data ?? [];
  const departmentName = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.name]));
  const auditIds = audits.map((a: any) => a.id);

  const findingsRes = auditIds.length
    ? await supabase.from("hsba_audit_findings").select("id,department_id,owner_user_id,status").in("audit_id", auditIds)
    : { data: [] as any[] };
  const findings = findingsRes.data ?? [];
  const ownerIds = Array.from(new Set(findings.map((f: any) => f.owner_user_id).filter(Boolean)));
  const ownersRes = ownerIds.length ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", ownerIds) : { data: [] as any[] };
  const ownerName = new Map((ownersRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id]));

  const passCount = audits.filter((a: any) => a.overall_result === "PASS").length;
  const partialCount = audits.filter((a: any) => a.overall_result === "PARTIAL").length;
  const failCount = audits.filter((a: any) => a.overall_result === "FAIL").length;

  const findingsByDept = new Map<string, number>();
  for (const f of findings) findingsByDept.set(f.department_id, (findingsByDept.get(f.department_id) || 0) + 1);

  const violationsByUser = new Map<string, number>();
  for (const f of findings) {
    if (!f.owner_user_id) continue;
    violationsByUser.set(f.owner_user_id, (violationsByUser.get(f.owner_user_id) || 0) + 1);
  }
  const repeatOffenders = Array.from(violationsByUser.entries()).filter(([, count]) => count >= 2);

  return (
    <div className="hsba-report">
      <form className="toolbar" style={{ padding: "0 0 12px" }}>
        <input type="hidden" name="type" value={auditType} />
        <label>
          Kỳ báo cáo:{" "}
          <input type="month" name="period" defaultValue={period} className="input" style={{ width: "auto", display: "inline-block" }} />
        </label>
        <button type="submit" className="button secondary small">
          Xem
        </button>
        <a className="button tertiary small" href={`/api/hsba-audit/audits/export?audit_type=${auditType}&period=${period}`}>
          Xuất Excel
        </a>
      </form>

      <div className="hsba-report-kpis">
        <div className="kpi-tile">
          <span>Lượt kiểm tra</span>
          <strong>{audits.length}</strong>
        </div>
        <div className="kpi-tile">
          <span>Đạt</span>
          <strong>{passCount}</strong>
        </div>
        {auditType !== "HSBA" ? (
          <div className="kpi-tile">
            <span>Đạt 1 phần</span>
            <strong>{partialCount}</strong>
          </div>
        ) : null}
        <div className="kpi-tile">
          <span>Chưa đạt</span>
          <strong>{failCount}</strong>
        </div>
        <div className="kpi-tile">
          <span>Tổng lỗi</span>
          <strong>{findings.length}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-title">
          <h2>Lỗi theo khoa/phòng — kỳ {period}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Khoa/Phòng</th>
                <th style={{ width: 120 }}>Số lỗi</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(findingsByDept.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([deptId, count]) => (
                  <tr key={deptId}>
                    <td>{departmentName.get(deptId) || "—"}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              {!findingsByDept.size ? (
                <tr>
                  <td colSpan={2} className="empty-state compact">
                    Không có lỗi nào trong kỳ này.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Nhân viên vi phạm lặp lại (≥2 lần trong kỳ) — gửi Phòng Nhân sự</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th style={{ width: 120 }}>Số lần vi phạm</th>
              </tr>
            </thead>
            <tbody>
              {repeatOffenders.map(([userId, count]) => (
                <tr key={userId}>
                  <td>{ownerName.get(userId) || userId}</td>
                  <td>{count}</td>
                </tr>
              ))}
              {!repeatOffenders.length ? (
                <tr>
                  <td colSpan={2} className="empty-state compact">
                    Chưa có dữ liệu — cần gán &quot;nhân viên phụ trách&quot; vào từng lỗi để báo cáo này đầy đủ.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <style>{`
        .hsba-report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
        .kpi-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}
        .kpi-tile span{font-size:11px;color:#64748b;font-weight:700}
        .kpi-tile strong{font-size:22px}
        @media(max-width:640px){.hsba-report-kpis{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
