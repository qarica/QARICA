import Link from "next/link";
import { redirect } from "next/navigation";
import { TQM_CHART_CSS, TqmDonut, TqmHorizontalBars, TqmTrend, type Tone } from "@/components/tqm-charts";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

// 6 mã bảng kiểm 5S theo QĐ 06/QLCL - đúng danh sách đã nạp, không gộp dữ liệu gốc,
// chỉ gộp Ở TẦNG BÁO CÁO này.
const FIVE_S_CODES = [
  "BK01.V1_QLCL.QĐ.06",
  "BK02.V1_QLCL.QĐ.06",
  "BK03.V1_QLCL.QĐ.06",
  "BK05.V1_QLCL.QĐ.06",
  "BK07.V1_QLCL.QĐ.06",
  "BK09.V1_QLCL.QĐ.06",
];

const AREA_LABEL: Record<string, string> = {
  "BK01.V1_QLCL.QĐ.06": "Bên ngoài bệnh viện",
  "BK02.V1_QLCL.QĐ.06": "Tiếp nhận khách hàng",
  "BK03.V1_QLCL.QĐ.06": "Phòng khám",
  "BK05.V1_QLCL.QĐ.06": "Nhà thuốc",
  "BK07.V1_QLCL.QĐ.06": "Phòng lưu khách hàng",
  "BK09.V1_QLCL.QĐ.06": "Vệ sinh",
};

export default async function FiveSSummaryPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["checklists.view", "checklists.manage", "monitoring.perform"])) redirect("/dashboard?forbidden=1");

  const year = await getWorkYear();
  const supabase = await createClient();

  const { data: templates, error: templatesError } = await supabase
    .from("checklist_templates")
    .select("id,code,name")
    .in("code", FIVE_S_CODES);
  if (templatesError) return <div className="alert error">Không tải được danh sách bảng kiểm 5S: {templatesError.message}</div>;

  const templateById = new Map((templates ?? []).map((t: any) => [t.id, t]));
  const templateIds = (templates ?? []).map((t: any) => t.id);

  const { data: versions, error: versionsError } = templateIds.length
    ? await supabase.from("checklist_versions").select("id,checklist_template_id,status").in("checklist_template_id", templateIds)
    : { data: [], error: null };
  if (versionsError) return <div className="alert error">Không tải được phiên bản bảng kiểm: {versionsError.message}</div>;

  const versionToTemplate = new Map((versions ?? []).map((v: any) => [v.id, v.checklist_template_id]));
  const versionIds = (versions ?? []).map((v: any) => v.id);

  const { data: rounds, error: roundsError } = versionIds.length
    ? await supabase
        .from("monitoring_rounds")
        .select("id,checklist_version_id,work_year,scheduled_date,target_area,workflow_status")
        .in("checklist_version_id", versionIds)
        .eq("work_year", year)
        .neq("workflow_status", "CANCELLED")
    : { data: [], error: null };
  if (roundsError) return <div className="alert error">Không tải được đợt giám sát 5S: {roundsError.message}</div>;

  const roundIds = (rounds ?? []).map((r: any) => r.id);
  const { data: responses, error: responsesError } = roundIds.length
    ? await supabase.from("checklist_responses").select("monitoring_round_id,result_status").in("monitoring_round_id", roundIds)
    : { data: [], error: null };
  if (responsesError) return <div className="alert error">Không tải được kết quả chấm: {responsesError.message}</div>;

  const responsesByRound = new Map<string, any[]>();
  for (const r of responses ?? []) {
    const key = (r as any).monitoring_round_id;
    responsesByRound.set(key, [...(responsesByRound.get(key) ?? []), r]);
  }

  // Tổng hợp theo từng mã bảng kiểm (khu vực)
  const perArea = new Map<string, { pass: number; fail: number; roundCount: number; lastDate: string | null }>();
  for (const code of FIVE_S_CODES) perArea.set(code, { pass: 0, fail: 0, roundCount: 0, lastDate: null });

  const months = Array.from({ length: 12 }, (_, i) => ({ label: `T${i + 1}`, value: 0 }));

  for (const round of rounds ?? []) {
    const templateId = versionToTemplate.get((round as any).checklist_version_id);
    const template = templateId ? templateById.get(templateId) : null;
    const code = template?.code;
    if (!code || !perArea.has(code)) continue;
    const agg = perArea.get(code)!;
    agg.roundCount += 1;
    const scheduled = (round as any).scheduled_date as string | null;
    if (scheduled && (!agg.lastDate || scheduled > agg.lastDate)) agg.lastDate = scheduled;
    const resList = responsesByRound.get((round as any).id) ?? [];
    for (const res of resList) {
      const status = String((res as any).result_status || "").toUpperCase();
      if (status === "PASS") agg.pass += 1;
      else if (status === "FAIL") agg.fail += 1;
    }
    const m = Number(String(scheduled || "").slice(5, 7));
    if (m >= 1 && m <= 12) months[m - 1].value += 1;
  }

  const totalPass = Array.from(perArea.values()).reduce((s, a) => s + a.pass, 0);
  const totalFail = Array.from(perArea.values()).reduce((s, a) => s + a.fail, 0);
  const totalScored = totalPass + totalFail;
  const overallPct = totalScored ? Math.round((totalPass / totalScored) * 100) : 0;
  const totalRounds = Array.from(perArea.values()).reduce((s, a) => s + a.roundCount, 0);

  const areaBars = FIVE_S_CODES.map((code) => {
    const agg = perArea.get(code)!;
    const total = agg.pass + agg.fail;
    const pct = total ? Math.round((agg.pass / total) * 100) : 0;
    const tone: Tone = total === 0 ? "slate" : pct >= 90 ? "green" : pct >= 75 ? "blue" : pct >= 60 ? "amber" : "red";
    return {
      label: AREA_LABEL[code] || code,
      value: pct,
      tone,
      caption: total ? `${total} mục đã chấm · ${agg.roundCount} đợt` : "Chưa có đợt giám sát",
    };
  });

  return (
    <div className="page-stack">
      <style>{TQM_CHART_CSS}</style>
      <div className="page-header">
        <div className="eyebrow">GIÁM SÁT · 5S · {year}</div>
        <h1>Tổng hợp 5S toàn viện</h1>
        <p className="muted">
          Gộp kết quả 6 bảng kiểm 5S (BK01, BK02, BK03, BK05, BK07, BK09) theo khu vực, chỉ ở tầng báo cáo — mỗi bảng kiểm vẫn giữ nguyên là văn bản kiểm soát riêng, không gộp dữ liệu gốc.
        </p>
        <Link className="table-link" href="/monitoring">← Quay lại Giám sát &amp; Bảng kiểm</Link>
      </div>

      <section className="kpi-grid">
        <article className="kpi-card">
          <span>Tỷ lệ đạt toàn 5S</span>
          <strong>{overallPct}%</strong>
          <small>{totalPass}/{totalScored || 0} mục được chấm đạt</small>
        </article>
        <article className="kpi-card">
          <span>Lượt giám sát năm {year}</span>
          <strong>{totalRounds}</strong>
          <small>Trên cả 6 khu vực</small>
        </article>
        <article className="kpi-card">
          <span>Khu vực đã có dữ liệu</span>
          <strong>{areaBars.filter((a) => a.caption !== "Chưa có đợt giám sát").length}/6</strong>
          <small>Khu vực đã từng được giám sát</small>
        </article>
      </section>

      <section className="tqm-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14 }}>
        <article className="panel">
          <div className="tqm-head">
            <h2>Xu hướng lượt giám sát 5S 12 tháng</h2>
            <p className="muted">Gộp cả 6 khu vực, theo tháng lên lịch giám sát.</p>
          </div>
          <TqmTrend points={months} unit="" />
        </article>
        <article className="panel">
          <div className="tqm-head">
            <h2>Kết quả chung</h2>
            <p className="muted">Tổng PASS/FAIL từ các mục đã chấm, cả 6 khu vực.</p>
          </div>
          <TqmDonut value={overallPct} label="Mục đạt" segments={[{ label: "Đạt", value: totalPass, tone: "brand" }, { label: "Chưa đạt", value: totalFail, tone: "red" }]} />
        </article>
      </section>

      <section className="panel">
        <div className="tqm-head">
          <h2>Tỷ lệ tuân thủ theo khu vực</h2>
          <p className="muted">Xếp khu vực có tỷ lệ đạt thấp lên trước để ưu tiên hỗ trợ và giám sát lại.</p>
        </div>
        {areaBars.some((a) => a.caption !== "Chưa có đợt giám sát")
          ? <TqmHorizontalBars rows={[...areaBars].sort((a, b) => a.value - b.value)} max={100} />
          : <div className="empty-state">Chưa có đợt giám sát 5S nào trong năm {year}. Tạo đợt đầu tiên từ trang Mẫu bảng kiểm để bắt đầu có số liệu ở đây.</div>}
      </section>

      <section className="panel">
        <div className="tqm-head">
          <h2>Chi tiết theo bảng kiểm</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Mã</th><th>Khu vực</th><th>Số đợt</th><th>Mục đạt / Đã chấm</th><th>Tỷ lệ</th><th>Lần giám sát gần nhất</th></tr>
            </thead>
            <tbody>
              {FIVE_S_CODES.map((code) => {
                const agg = perArea.get(code)!;
                const total = agg.pass + agg.fail;
                const pct = total ? Math.round((agg.pass / total) * 100) : null;
                const template = (templates ?? []).find((t: any) => t.code === code) as any;
                return (
                  <tr key={code}>
                    <td>{template ? <Link className="table-link" href={`/monitoring/templates/${template.id}`}>{code}</Link> : code}</td>
                    <td>{AREA_LABEL[code]}</td>
                    <td>{agg.roundCount}</td>
                    <td>{total ? `${agg.pass}/${total}` : "—"}</td>
                    <td>{pct === null ? "—" : `${pct}%`}</td>
                    <td>{agg.lastDate ? new Date(agg.lastDate).toLocaleDateString("vi-VN") : "Chưa có"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
