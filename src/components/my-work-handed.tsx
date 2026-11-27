import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { HandedRow } from "@/lib/my-work-handed";

/** "Đã chuyển đi": xem lại việc đã chuyển/giao cho người khác và tình trạng hiện tại của chúng. Chỉ xem. */
export function MyWorkHanded({ rows, error }: { rows: HandedRow[]; error: string | null }) {
  return (
    <div style={{ padding: "8px 16px 16px" }}>
      <p className="mx-note" style={{ margin: "0 0 8px" }}>Việc bạn đã chuyển cho người khác không còn trong danh sách việc của bạn, nhưng luôn xem lại được ở đây cùng tình trạng hiện tại. Việc giao cho người chưa có tài khoản vẫn nằm trong danh sách của bạn để theo dõi.</p>
      {error ? <div className="alert error">Không tải được: {error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Việc</th><th>Chuyển cho</th><th>Ngày chuyển</th><th>Lý do</th><th>Tình trạng hiện tại</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td>{r.recordId ? <Link href={`/tasks/${r.recordId}`}>{r.title}</Link> : r.title}<br /><small className="muted">{r.source === "ACTION" ? "Action được giao" : r.source === "WORK_PLAN" ? "Đầu việc kế hoạch" : "Việc cá nhân"}</small></td>
                <td>{r.toName}{r.external ? <><br /><small className="muted">chưa có tài khoản</small></> : null}</td>
                <td>{formatDate(r.at)}</td>
                <td>{r.reason}</td>
                <td>{r.statusLabel}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6}><div className="empty-state">Bạn chưa chuyển việc nào cho người khác.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
