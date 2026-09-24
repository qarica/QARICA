import Link from "next/link";
import { redirect } from "next/navigation";
import { DomainCreateClient } from "@/components/domain-create-client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

type PublishedItem = {
  key: string;
  kind: "LESSON" | "ALERT";
  title: string;
  summary: string;
  lesson: string;
  recommendation: string;
  audience: string | null;
  publishedAt: string | null;
  href: string;
};

function dateLabel(value: string | null) {
  if (!value) return "Chưa ghi nhận ngày";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa ghi nhận ngày";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

export default async function SafetyAlertsPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["safety_alert.view", "safety_alert.edit", "safety_alert.publish"])) {
    redirect("/dashboard?forbidden=1");
  }

  const year = await getWorkYear();
  const supabase = await createClient();
  const admin = createAdminClient();
  const canManage =
    user.permissions.includes("safety_alert.edit") ||
    user.permissions.includes("safety_alert.publish");

  const recordsRes = await supabase
    .from("records")
    .select("id,record_type,record_code,title,lifecycle_status,updated_at")
    .in("record_type", ["INCIDENT", "SAFETY_ALERT"])
    .eq("work_year", year)
    .order("updated_at", { ascending: false });

  const records = (recordsRes.data ?? []) as any[];
  const incidentRecords = records.filter((row) => row.record_type === "INCIDENT");
  const alertRecords = records.filter((row) => row.record_type === "SAFETY_ALERT");
  const incidentRecordIds = incidentRecords.map((row) => row.id);
  const alertRecordIds = alertRecords.map((row) => row.id);

  const [incidentsRes, alertsRes] = await Promise.all([
    incidentRecordIds.length
      ? supabase.from("incidents").select("id,record_id").in("record_id", incidentRecordIds)
      : Promise.resolve({ data: [], error: null }),
    alertRecordIds.length
      ? supabase
          .from("safety_alerts")
          .select("id,record_id,title,summary,lesson,recommendation,status,published_at,expires_at")
          .in("record_id", alertRecordIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const incidents = (incidentsRes.data ?? []) as any[];
  const incidentRecordByIncidentId = new Map(
    incidents.map((row) => [row.id, row.record_id]),
  );
  const incidentIds = incidents.map((row) => row.id);

  const lessonsRes = incidentIds.length
    ? await admin
        .from("incident_lessons_learned")
        .select(
          "id,incident_id,status,title,summary,learning_points,recommended_practice,audience,deidentified_confirmed,published_at",
        )
        .in("incident_id", incidentIds)
        .eq("status", "PUBLISHED")
        .eq("deidentified_confirmed", true)
    : { data: [], error: null };

  const alertRecordMap = new Map(alertRecords.map((row) => [row.id, row]));
  const published: PublishedItem[] = [];

  for (const lesson of (lessonsRes.data ?? []) as any[]) {
    const recordId = incidentRecordByIncidentId.get(lesson.incident_id);
    if (!recordId) continue;
    published.push({
      key: `lesson:${lesson.id}`,
      kind: "LESSON",
      title: String(lesson.title || "Bài học kinh nghiệm từ sự cố"),
      summary: String(lesson.summary || ""),
      lesson: String(lesson.learning_points || ""),
      recommendation: String(lesson.recommended_practice || ""),
      audience: lesson.audience ? String(lesson.audience) : null,
      publishedAt: lesson.published_at || null,
      href: `/incidents/${recordId}`,
    });
  }

  const alertRows = (alertsRes.data ?? []) as any[];
  for (const alert of alertRows.filter((row) => row.status === "PUBLISHED")) {
    const record = alertRecordMap.get(alert.record_id);
    if (!record) continue;
    published.push({
      key: `alert:${alert.id}`,
      kind: "ALERT",
      title: String(alert.title || record.title || "Cảnh báo an toàn"),
      summary: String(alert.summary || ""),
      lesson: String(alert.lesson || ""),
      recommendation: String(alert.recommendation || ""),
      audience: null,
      publishedAt: alert.published_at || null,
      href: `/safety-alerts/${alert.record_id}`,
    });
  }

  published.sort(
    (a, b) =>
      Date.parse(b.publishedAt || "1970-01-01") -
      Date.parse(a.publishedAt || "1970-01-01"),
  );

  const pending = canManage
    ? alertRows
        .filter((row) => ["DRAFT", "REVIEWING"].includes(String(row.status)))
        .map((row) => {
          const record = alertRecordMap.get(row.record_id);
          return {
            id: row.id,
            recordId: row.record_id,
            code: record?.record_code || "—",
            title: row.title || record?.title || "Bài học / Cảnh báo",
            status: String(row.status || "DRAFT"),
            updatedAt: record?.updated_at || null,
          };
        })
    : [];

  const lessonCount = published.filter((item) => item.kind === "LESSON").length;
  const alertCount = published.filter((item) => item.kind === "ALERT").length;

  return (
    <div className="page-stack learning-hub">
      <style>{`
        .learning-hub .learning-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .learning-hub .learning-kpi{background:#fff;border:1px solid #dfe7ef;border-radius:15px;padding:14px}
        .learning-hub .learning-kpi span{display:block;color:#687a90;font-size:10px;font-weight:800;text-transform:uppercase}
        .learning-hub .learning-kpi strong{display:block;margin-top:6px;color:#173b64;font-size:26px}
        .learning-hub .learning-head{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:16px 17px 8px}
        .learning-hub .learning-head h2{margin:0;font-size:16px}.learning-hub .learning-head p{margin:4px 0 0;color:#6d7d8b;font-size:11px}
        .learning-hub .learning-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;padding:8px 16px 16px}
        .learning-hub .learning-card{display:block;border:1px solid #dde7ef;border-radius:14px;background:#fff;padding:14px;transition:.18s}
        .learning-hub .learning-card:hover{border-color:#8fb0d1;box-shadow:0 8px 20px rgba(16,40,72,.07);transform:translateY(-1px)}
        .learning-hub .learning-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .learning-hub .learning-kind{display:inline-flex;padding:4px 7px;border-radius:999px;background:#edf4fb;color:#315f91;font-size:9px;font-weight:850}
        .learning-hub .learning-kind.lesson{background:#eef8f1;color:#23744a}
        .learning-hub .learning-date{color:#7a8997;font-size:9px}
        .learning-hub .learning-card h3{margin:9px 0 0;font-size:14px;color:#17304e}
        .learning-hub .learning-card p{margin:6px 0 0;color:#607181;font-size:11px;line-height:1.5}
        .learning-hub .learning-block{margin-top:10px;padding-top:9px;border-top:1px solid #edf1f4}
        .learning-hub .learning-block strong{display:block;color:#445b72;font-size:10px}
        .learning-hub .learning-block span{display:block;margin-top:3px;color:#687987;font-size:10px;line-height:1.45}
        .learning-hub .learning-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;color:#315f91;font-size:10px;font-weight:800}
        .learning-hub .pending-list{display:grid;gap:7px;padding:8px 16px 16px}
        .learning-hub .pending-row{display:grid;grid-template-columns:110px minmax(0,1fr) 120px auto;gap:10px;align-items:center;border:1px solid #e3e9ef;border-radius:12px;padding:10px 11px;background:#fbfcfd}
        .learning-hub .empty{padding:28px 18px;text-align:center;color:#71808e;font-size:11px}
        @media(max-width:820px){.learning-hub .learning-grid{grid-template-columns:1fr}.learning-hub .learning-kpis{grid-template-columns:1fr 1fr}.learning-hub .pending-row{grid-template-columns:1fr auto}.learning-hub .pending-row>div:nth-child(2){grid-column:1/-1}}
      `}</style>

      <PageHeader
        eyebrow={`AN TOÀN & HỌC TẬP · ${year}`}
        title="Kho bài học / Cảnh báo"
        description="Bài học đã duyệt từ sự cố tự xuất hiện tại đây, không cần nhập lại thành một hồ sơ khác. Cảnh báo an toàn vẫn giữ luồng soạn → rà soát → phát hành riêng khi cần."
        actions={canManage ? <DomainCreateClient recordType="SAFETY_ALERT" workYear={year} /> : null}
      />

      {recordsRes.error || incidentsRes.error || alertsRes.error || lessonsRes.error ? (
        <div className="alert error">
          Một phần dữ liệu học tập chưa tải được đầy đủ.
        </div>
      ) : null}

      <section className="learning-kpis" aria-label="Tổng quan kho học tập">
        <article className="learning-kpi"><span>Đã phát hành</span><strong>{published.length}</strong></article>
        <article className="learning-kpi"><span>Bài học từ sự cố</span><strong>{lessonCount}</strong></article>
        <article className="learning-kpi"><span>Cảnh báo an toàn</span><strong>{alertCount}</strong></article>
        <article className="learning-kpi"><span>Chờ QLCL xử lý</span><strong>{pending.length}</strong></article>
      </section>

      <section className="panel">
        <div className="learning-head">
          <div>
            <h2>Bài học đã phát hành</h2>
            <p>Chỉ hiển thị bài học sự cố đã xác nhận khử định danh và cảnh báo đã PUBLISHED.</p>
          </div>
          <span className="eyebrow">LEARNING SYSTEM</span>
        </div>
        {published.length ? (
          <div className="learning-grid">
            {published.map((item) => (
              <Link className="learning-card" href={item.href} key={item.key}>
                <div className="learning-card-top">
                  <span className={`learning-kind ${item.kind === "LESSON" ? "lesson" : ""}`}>
                    {item.kind === "LESSON" ? "BÀI HỌC TỪ SỰ CỐ" : "CẢNH BÁO AN TOÀN"}
                  </span>
                  <span className="learning-date">{dateLabel(item.publishedAt)}</span>
                </div>
                <h3>{item.title}</h3>
                {item.summary ? <p>{item.summary}</p> : null}
                {item.lesson ? <div className="learning-block"><strong>Bài học</strong><span>{item.lesson}</span></div> : null}
                {item.recommendation ? <div className="learning-block"><strong>Khuyến nghị áp dụng</strong><span>{item.recommendation}</span></div> : null}
                <div className="learning-foot">
                  <span>{item.audience ? `Đối tượng: ${item.audience}` : "Nội dung đã được phát hành"}</span>
                  <span>Mở nguồn →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">Chưa có bài học hoặc cảnh báo nào đã phát hành trong năm {year}.</div>
        )}
      </section>

      {canManage ? (
        <section className="panel">
          <div className="learning-head">
            <div>
              <h2>Chờ QLCL xử lý</h2>
              <p>Các cảnh báo đang ở Nháp hoặc Đang rà soát được đưa vào hàng đợi để tránh bỏ sót.</p>
            </div>
          </div>
          {pending.length ? (
            <div className="pending-list">
              {pending.map((item) => (
                <div className="pending-row" key={item.id}>
                  <strong>{item.code}</strong>
                  <div>{item.title}</div>
                  <StatusBadge status={item.status} />
                  <Link className="button secondary small" href={`/safety-alerts/${item.recordId}`}>Xử lý</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Không có cảnh báo đang chờ xử lý.</div>
          )}
        </section>
      ) : null}
    </div>
  );
}
