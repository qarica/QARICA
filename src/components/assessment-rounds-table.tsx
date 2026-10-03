"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

export type AssessmentRoundRow = {
  id: string;
  route: string;
  code: string;
  title: string;
  roundType: string;
  department: string;
  startDate: string | null;
  deadline: string | null;
  status: string;
  resultLabel: string;
  resultTone: "green" | "red" | "amber" | "slate";
};

const PAGE_SIZE = 10;

function ResultBadge({ label, tone }: { label: string; tone: AssessmentRoundRow["resultTone"] }) {
  return <span className={`av2-result-badge ${tone}`}>{label}</span>;
}

export function AssessmentRoundsTable({ rows }: { rows: AssessmentRoundRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [roundType, setRoundType] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [page, setPage] = useState(1);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);
  const roundTypeOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.roundType).filter(Boolean))).sort(), [rows]);
  const departmentOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!needle || `${r.code} ${r.title} ${r.department}`.toLowerCase().includes(needle)) &&
      (status === "ALL" || r.status === status) &&
      (roundType === "ALL" || r.roundType === roundType) &&
      (department === "ALL" || r.department === department)
    );
  }, [rows, q, status, roundType, department]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  function updateFilter() {
    setPage(1);
  }

  return <section className="panel module-list-panel av2-rounds-panel" id="assessment-rounds">
    <div className="av2-head"><h2>Danh sách đợt đánh giá</h2><p>Toàn bộ đợt tự đánh giá trong năm, lọc theo trạng thái/loại đợt/đơn vị và tìm theo mã, tên hoặc đơn vị phụ trách.</p></div>
    <div className="av2-rounds-toolbar">
      <input value={q} onChange={(e) => { setQ(e.target.value); updateFilter(); }} placeholder="Tìm mã, tên đợt đánh giá, đơn vị..." />
      <select value={status} onChange={(e) => { setStatus(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả trạng thái</option>
        {statusOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
      <select value={roundType} onChange={(e) => { setRoundType(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả loại đánh giá</option>
        {roundTypeOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
      <select value={department} onChange={(e) => { setDepartment(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả đơn vị</option>
        {departmentOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
    </div>
    <div className="module-list-summary"><strong>{filtered.length}</strong> / {rows.length} đợt đánh giá</div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Mã đợt</th><th>Tên đợt đánh giá</th><th>Loại đánh giá</th><th>Đơn vị</th><th>Thời gian</th><th>Trạng thái</th><th>Kết quả</th><th>Thao tác</th></tr></thead>
        <tbody>
          {pageRows.map((r) => <tr key={r.id}>
            <td><span className="record-code-pill">{r.code}</span></td>
            <td><Link className="record-title-link" href={r.route}>{r.title}</Link></td>
            <td>{r.roundType || "—"}</td>
            <td>{r.department}</td>
            <td>{r.startDate ? formatDate(r.startDate) : "—"}{r.deadline ? ` – ${formatDate(r.deadline)}` : ""}</td>
            <td><StatusBadge status={r.status} /></td>
            <td><ResultBadge label={r.resultLabel} tone={r.resultTone} /></td>
            <td><Link className="av2-round-view" href={r.route} title="Xem chi tiết"><Icon name="eye" size={16} /></Link></td>
          </tr>)}
          {!pageRows.length ? <tr><td colSpan={8}><div className="empty-state">Không có đợt đánh giá phù hợp.</div></td></tr> : null}
        </tbody>
      </table>
    </div>
    {filtered.length ? <div className="module-pagination"><span>Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} của {filtered.length} bản ghi</span><div className="module-pagination-pages">{Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => <button type="button" key={pn} className={`button small ${pn === currentPage ? "primary" : "secondary"}`} onClick={() => setPage(pn)}>{pn}</button>)}</div></div> : null}
  </section>;
}
