"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

export type IncidentRegistryRow = {
  id: string;
  route: string;
  code: string;
  title: string;
  domainLabel: string;
  department: string;
  occurredAt: string | null;
  status: string;
  harmLabel: string;
  harmTone: "red" | "amber" | "blue" | "slate";
  reporterLabel: string;
};

const PAGE_SIZE = 10;

function HarmBadge({ label, tone }: { label: string; tone: IncidentRegistryRow["harmTone"] }) {
  return <span className={`incident-registry-harm ${tone}`}>{label}</span>;
}

export function IncidentRegistryTable({ rows }: { rows: IncidentRegistryRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [domain, setDomain] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [page, setPage] = useState(1);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);
  const domainOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.domainLabel).filter(Boolean))).sort(), [rows]);
  const departmentOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!needle || `${r.code} ${r.title} ${r.department}`.toLowerCase().includes(needle)) &&
      (status === "ALL" || r.status === status) &&
      (domain === "ALL" || r.domainLabel === domain) &&
      (department === "ALL" || r.department === department)
    );
  }, [rows, q, status, domain, department]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  function updateFilter() {
    setPage(1);
  }

  return <section className="panel module-list-panel incident-registry-panel" id="incident-registry">
    <div className="head"><h2>Danh sách sự cố & phản ánh</h2><p>Toàn bộ hồ sơ trong năm, lọc theo trạng thái/lĩnh vực/khoa-phòng và tìm theo mã, tiêu đề hoặc khoa/phòng.</p></div>
    <div className="incident-registry-toolbar">
      <input value={q} onChange={(e) => { setQ(e.target.value); updateFilter(); }} placeholder="Tìm mã, tiêu đề, khoa/phòng..." />
      <select value={status} onChange={(e) => { setStatus(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả trạng thái</option>
        {statusOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
      <select value={domain} onChange={(e) => { setDomain(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả lĩnh vực</option>
        {domainOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
      <select value={department} onChange={(e) => { setDepartment(e.target.value); updateFilter(); }}>
        <option value="ALL">Tất cả khoa/phòng</option>
        {departmentOptions.map((s) => <option value={s} key={s}>{s}</option>)}
      </select>
    </div>
    <div className="module-list-summary"><strong>{filtered.length}</strong> / {rows.length} hồ sơ</div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Mã sự cố</th><th>Lĩnh vực</th><th>Tiêu đề</th><th>Khoa/phòng</th><th>Ngày xảy ra</th><th>Trạng thái</th><th>Mức tổn hại</th><th>Người báo cáo</th><th>Thao tác</th></tr></thead>
        <tbody>
          {pageRows.map((r) => <tr key={r.id}>
            <td><span className="record-code-pill">{r.code}</span></td>
            <td>{r.domainLabel || "—"}</td>
            <td><Link className="record-title-link" href={r.route}>{r.title}</Link></td>
            <td>{r.department}</td>
            <td>{r.occurredAt ? formatDate(r.occurredAt) : "—"}</td>
            <td><StatusBadge status={r.status} /></td>
            <td><HarmBadge label={r.harmLabel} tone={r.harmTone} /></td>
            <td>{r.reporterLabel}</td>
            <td><Link className="incident-registry-view" href={r.route} title="Xem chi tiết"><Icon name="eye" size={16} /></Link></td>
          </tr>)}
          {!pageRows.length ? <tr><td colSpan={9}><div className="empty-state">Không có hồ sơ phù hợp.</div></td></tr> : null}
        </tbody>
      </table>
    </div>
    {filtered.length ? <div className="module-pagination"><span>Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} của {filtered.length} bản ghi</span><div className="module-pagination-pages">{Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => <button type="button" key={pn} className={`button small ${pn === currentPage ? "primary" : "secondary"}`} onClick={() => setPage(pn)}>{pn}</button>)}</div></div> : null}
  </section>;
}
