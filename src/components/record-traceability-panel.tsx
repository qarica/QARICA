import Link from "next/link";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";

const RELATION_LABEL: Record<string, string> = {
  HAS_ACTION: "Có hành động xử lý",
  GENERATED_FINDING: "Sinh Finding",
  GENERATED_CAPA: "Sinh CAPA",
  GENERATED_PROJECT: "Chuyển thành đề án",
  CREATED_PROJECT: "Chuyển thành đề án",
  COMPARED_WITH_SELF: "So sánh với tự đánh giá",
  RELATED_TO: "Liên quan",
  CAUSED_BY: "Phát sinh từ",
  ADDRESSES: "Xử lý",
  FOLLOW_UP_OF: "Theo dõi sau",
  EVIDENCE_FOR: "Minh chứng cho",
};

const TYPE_LABEL: Record<string, string> = {
  ACTION: "Action",
  DIRECTIVE: "Chỉ đạo/Yêu cầu",
  REPORT: "Báo cáo",
  INSPECTION: "Tiếp đoàn",
  INDICATOR_MEASUREMENT: "Chỉ số",
  MONITORING: "Giám sát",
  FINDING: "Finding",
  INCIDENT: "Sự cố",
  CAPA: "CAPA",
  RISK: "Rủi ro",
  FMEA: "FMEA/HFMEA",
  IMPROVEMENT_PROPOSAL: "Đề xuất cải tiến",
  IMPROVEMENT_PROJECT: "Đề án cải tiến",
  ASSESSMENT: "Tự đánh giá",
  EXTERNAL_ASSESSMENT: "Đánh giá ngoài",
  AUDIT: "Audit/Tracer",
  SAFETY_ALERT: "Cảnh báo an toàn",
  FEEDBACK: "Phản ánh/Góp ý",
  PROGRAM: "Kế hoạch",
};

function relationLabel(value: string) {
  return RELATION_LABEL[value] || value.replaceAll("_", " ");
}

function typeLabel(value: string) {
  return TYPE_LABEL[value] || value.replaceAll("_", " ");
}

export async function RecordTraceabilityPanel({ recordId }: { recordId: string }) {
  const supabase = await createClient();
  const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] = await Promise.all([
    supabase.from("record_links").select("id,source_record_id,target_record_id,relation_type,metadata").eq("source_record_id", recordId),
    supabase.from("record_links").select("id,source_record_id,target_record_id,relation_type,metadata").eq("target_record_id", recordId),
  ]);

  if (outgoingError || incomingError) return null;
  const allLinks = [...(outgoing ?? []), ...(incoming ?? [])] as any[];
  if (!allLinks.length) return null;

  const relatedIds = Array.from(new Set(allLinks.map((link) => link.source_record_id === recordId ? link.target_record_id : link.source_record_id).filter(Boolean))) as string[];
  if (!relatedIds.length) return null;

  const { data: records } = await supabase
    .from("records")
    .select("id,record_type,record_code,title,lifecycle_status,work_year")
    .in("id", relatedIds);

  const recordMap = new Map(((records ?? []) as any[]).map((record) => [record.id, record]));
  const rows = allLinks.map((link) => {
    const isOutgoing = link.source_record_id === recordId;
    const relatedId = isOutgoing ? link.target_record_id : link.source_record_id;
    const record: any = recordMap.get(relatedId);
    if (!record) return null;
    return {
      key: link.id,
      direction: isOutgoing ? "OUT" : "IN",
      relation: String(link.relation_type || "RELATED_TO"),
      record,
      metadata: link.metadata && typeof link.metadata === "object" ? link.metadata : null,
    };
  }).filter(Boolean) as any[];

  if (!rows.length) return null;

  return <section className="panel traceability-panel">
    <style>{`
      .traceability-panel{overflow:hidden}.trace-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:17px 18px;border-bottom:1px solid #e7eef0}.trace-head h2{margin:0;font-size:17px}.trace-head p{margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.5}.trace-count{font-size:11px;font-weight:850;padding:6px 9px;border-radius:999px;background:#eef6ff;color:#1d4ed8;white-space:nowrap}.trace-list{display:grid}.trace-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #eef2f3}.trace-row:last-child{border-bottom:0}.trace-direction{display:grid;place-items:center;width:30px;height:30px;border-radius:999px;font-size:14px;font-weight:900;background:#f1f5f9;color:#475569}.trace-direction.out{background:#e8f7ef;color:#166534}.trace-copy{min-width:0}.trace-copy strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.trace-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}.trace-pill{font-size:9px;font-weight:800;padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#475569}.trace-pill.relation{background:#eff6ff;color:#1d4ed8}.trace-note{margin-top:5px;font-size:10px;color:#64748b}.trace-row .button{white-space:nowrap}@media(max-width:650px){.trace-row{grid-template-columns:auto 1fr}.trace-row .button{grid-column:2;width:100%}.trace-head{display:grid}.trace-count{width:max-content}}
    `}</style>
    <div className="trace-head">
      <div><h2>Dòng truy vết liên hồ sơ</h2><p>Cho biết hồ sơ này phát sinh từ đâu và đã tạo/được nối tới hồ sơ nào. Liên kết được lấy từ dữ liệu nghiệp vụ, không suy diễn.</p></div>
      <span className="trace-count">{rows.length} liên kết</span>
    </div>
    <div className="trace-list">
      {rows.map((row) => {
        const criterion = row.metadata?.criterion_ref ? `Tiêu chí ${row.metadata.criterion_ref}` : null;
        return <div className="trace-row" key={`${row.direction}-${row.key}`}>
          <span className={`trace-direction ${row.direction === "OUT" ? "out" : ""}`}>{row.direction === "OUT" ? "→" : "←"}</span>
          <div className="trace-copy">
            <strong>{row.record.record_code} · {row.record.title}</strong>
            <div className="trace-meta">
              <span className="trace-pill relation">{row.direction === "OUT" ? relationLabel(row.relation) : `Nguồn: ${relationLabel(row.relation)}`}</span>
              <span className="trace-pill">{typeLabel(row.record.record_type)}</span>
              <span className="trace-pill">{row.record.lifecycle_status}</span>
              <span className="trace-pill">{row.record.work_year}</span>
            </div>
            {criterion ? <div className="trace-note">{criterion}</div> : null}
          </div>
          <Link className="button secondary small" href={routeForRecord(row.record.record_type, row.record.id)}>Mở hồ sơ</Link>
        </div>;
      })}
    </div>
  </section>;
}
