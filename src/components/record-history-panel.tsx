import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function RecordHistoryPanel({ recordId }: { recordId: string }) {
  const supabase = await createClient();
  const { data: history, error } = await supabase
    .from("record_status_history")
    .select("id,old_status,new_status,changed_by,reason,changed_at")
    .eq("record_id", recordId)
    .order("changed_at", { ascending: false })
    .limit(50);

  if (error) return null;
  const rows = (history ?? []) as any[];
  const userIds = Array.from(new Set(rows.map((row) => String(row.changed_by || "")).filter(Boolean)));
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", userIds)
    : { data: [] as any[] };
  const names = new Map<string, string>();
  for (const profile of (profiles ?? []) as any[]) names.set(String(profile.user_id), String(profile.full_name || profile.email || "Người dùng"));

  return <section className="panel record-history-panel">
    <style>{`
      .record-history-panel .rh-head{padding:18px 19px 11px}.record-history-panel .rh-head h2{font-size:19px;margin:0}.record-history-panel .rh-head p{font-size:13px;color:#64757b;margin:5px 0 0}.record-history-panel .rh-list{display:grid;padding:0 18px 18px}.record-history-panel .rh-row{display:grid;grid-template-columns:145px 190px minmax(0,1fr);gap:14px;padding:12px 4px;border-bottom:1px solid #edf2f3;align-items:start}.record-history-panel .rh-row:last-child{border-bottom:0}.record-history-panel .rh-time{font-size:11px;color:#6c7e84}.record-history-panel .rh-change{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.record-history-panel .rh-arrow{font-size:12px;color:#829095}.record-history-panel .rh-reason{font-size:13px;line-height:1.45}.record-history-panel .rh-actor{font-size:11px;color:#718087;margin-top:4px}.record-history-panel .rh-empty{padding:18px;color:#718087;font-size:13px}@media(max-width:700px){.record-history-panel .rh-row{grid-template-columns:1fr;gap:6px;padding:12px 2px}.record-history-panel .rh-change{order:1}.record-history-panel .rh-time{order:2}.record-history-panel .rh-reason{order:3}}
    `}</style>
    <div className="rh-head"><h2>Lịch sử trạng thái</h2><p>Giữ nguyên dấu vết thay đổi; không sửa ngược quá khứ để làm đẹp số liệu.</p></div>
    {rows.length ? <div className="rh-list">{rows.map((row) => <div className="rh-row" key={row.id}>
      <div className="rh-time">{formatDateTime(row.changed_at)}</div>
      <div className="rh-change">{row.old_status ? <StatusBadge status={row.old_status} /> : <span className="tiny muted">Khởi tạo</span>}<span className="rh-arrow">→</span><StatusBadge status={row.new_status} /></div>
      <div className="rh-reason">{row.reason || "Không có ghi chú bổ sung."}<div className="rh-actor">Thực hiện: {names.get(String(row.changed_by)) || "Hệ thống / chưa xác định"}</div></div>
    </div>)}</div> : <div className="rh-empty">Chưa có lần chuyển trạng thái được ghi vào lịch sử hồ sơ.</div>}
  </section>;
}
