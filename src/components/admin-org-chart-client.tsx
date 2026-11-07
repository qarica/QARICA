"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Department = { id: string; code: string | null; name: string; short_name: string | null; department_type: string | null; parent_department_id: string | null; is_active: boolean };
type Person = { user_id: string; full_name: string | null; email: string | null; job_title: string | null; primary_department_id: string | null; is_active: boolean };
type Equipment = { id: string; equipment_name: string; model_code: string | null; status: "IN_USE" | "MAINTENANCE" | "INACTIVE"; department_id: string | null };

const TYPE_LABEL: Record<string, string> = { CLINICAL: "Lâm sàng", PARACLINICAL: "Cận lâm sàng", MANAGEMENT: "Quản lý", SUPPORT: "Hỗ trợ" };
const EQUIPMENT_STATUS_LABEL: Record<string, string> = { IN_USE: "Đang sử dụng", MAINTENANCE: "Bảo trì/Sửa chữa", INACTIVE: "Ngưng sử dụng" };
const EQUIPMENT_STATUS_TONE: Record<string, string> = { IN_USE: "success", MAINTENANCE: "warning", INACTIVE: "muted" };

type TreeNode = { department: Department; children: TreeNode[] };

function buildTree(departments: Department[]): TreeNode[] {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const childrenOf = new Map<string, Department[]>();
  const roots: Department[] = [];
  for (const d of departments) {
    const parentId = d.parent_department_id && byId.has(d.parent_department_id) ? d.parent_department_id : null;
    if (!parentId) {
      roots.push(d);
      continue;
    }
    const list = childrenOf.get(parentId) ?? [];
    list.push(d);
    childrenOf.set(parentId, list);
  }
  const toNode = (d: Department): TreeNode => ({ department: d, children: (childrenOf.get(d.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "vi")).map(toNode) });
  return roots.sort((a, b) => a.name.localeCompare(b.name, "vi")).map(toNode);
}

export function AdminOrgChartClient({ departments, people, equipment }: { departments: Department[]; people: Person[]; equipment: Equipment[] }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(departments.filter((d) => showInactive || d.is_active || d.id === selectedId)), [departments, showInactive, selectedId]);
  const selected = departments.find((d) => d.id === selectedId) ?? null;
  const parentName = selected?.parent_department_id ? departments.find((d) => d.id === selected.parent_department_id)?.name ?? null : null;
  const staff = selected ? people.filter((p) => p.primary_department_id === selected.id).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "vi")) : [];
  const assets = selected ? equipment.filter((e) => e.department_id === selected.id).sort((a, b) => a.equipment_name.localeCompare(b.equipment_name, "vi")) : [];

  const query = search.trim().toLowerCase();
  const matchesSearch = (d: Department) => !query || `${d.name} ${d.short_name || ""} ${d.code || ""}`.toLowerCase().includes(query);
  const matchingIds = query ? new Set(departments.filter(matchesSearch).map((d) => d.id)) : null;

  function nodeVisible(node: TreeNode): boolean {
    if (!matchingIds) return true;
    if (matchingIds.has(node.department.id)) return true;
    return node.children.some(nodeVisible);
  }

  function renderNode(node: TreeNode, depth: number) {
    if (!nodeVisible(node)) return null;
    const d = node.department;
    return (
      <div key={d.id} className="org-chart-node" style={{ paddingLeft: depth * 18 }}>
        <button type="button" className={`org-chart-row${selectedId === d.id ? " is-selected" : ""}${d.is_active ? "" : " is-inactive"}`} onClick={() => setSelectedId(d.id)}>
          <Icon name={node.children.length ? "building-2" : "circle"} size={14} />
          <span className="org-chart-row-name">{d.name}</span>
          {!d.is_active ? <span className="status-badge muted">Ngưng hoạt động</span> : null}
        </button>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="org-chart-layout">
      <style>{`
        .org-chart-layout { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 920px) { .org-chart-layout { grid-template-columns: 1fr; } }
        .org-chart-tree-panel .search-box { margin: 0 16px 10px; }
        .org-chart-tree { padding: 0 8px 16px; max-height: 70vh; overflow: auto; }
        .org-chart-node { display: grid; gap: 2px; }
        .org-chart-row { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 9px; font-size: 13px; color: #334155; cursor: pointer; }
        .org-chart-row:hover { background: #f1f5f9; }
        .org-chart-row.is-selected { background: var(--brand-soft); color: var(--brand-dark); font-weight: 700; }
        .org-chart-row.is-inactive { color: #94a3b8; }
        .org-chart-row-name { flex: 1 1 auto; overflow-wrap: anywhere; }
        .org-chart-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .org-chart-detail-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: #64748b; margin-top: 4px; }
        .org-chart-section { margin-top: 16px; }
        .org-chart-section h3 { font-size: 13px; margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
        .org-chart-person-row, .org-chart-asset-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid #eef2f7; border-radius: 10px; margin-bottom: 6px; font-size: 13px; }
      `}</style>

      <section className="panel org-chart-tree-panel">
        <div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khoa/phòng..." /></div>
        <label className="inline-check" style={{ margin: "0 16px 10px" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện đơn vị đã ngưng
        </label>
        <div className="org-chart-tree">
          {tree.length ? tree.map((node) => renderNode(node, 0)) : <div className="empty-state">Chưa có đơn vị nào.</div>}
        </div>
      </section>

      <section className="panel">
        {!selected ? (
          <div className="empty-state" style={{ padding: 24 }}>Chọn một đơn vị bên trái để xem chi tiết.</div>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="org-chart-detail-head">
              <div>
                <div className="eyebrow">{TYPE_LABEL[selected.department_type || ""] || selected.department_type || "—"}</div>
                <h2 style={{ margin: "2px 0 0" }}>{selected.name}</h2>
                <div className="org-chart-detail-meta">
                  <span>Mã: {selected.code || "—"}</span>
                  {parentName ? <span>Trực thuộc: {parentName}</span> : <span>Đơn vị cấp cao nhất</span>}
                  <span className={`status-badge ${selected.is_active ? "success" : "muted"}`}>{selected.is_active ? "Đang hoạt động" : "Ngưng hoạt động"}</span>
                </div>
              </div>
            </div>

            <div className="org-chart-section">
              <h3><Icon name="users" size={15} /> Nhân sự ({staff.length})</h3>
              {staff.length ? staff.map((p) => (
                <div className="org-chart-person-row" key={p.user_id}>
                  <span>{p.full_name || p.email || p.user_id}</span>
                  <span className="muted">{p.job_title || "—"}</span>
                </div>
              )) : <div className="empty-state">Chưa có nhân sự nào gắn đơn vị này.</div>}
            </div>

            <div className="org-chart-section">
              <h3><Icon name="cog" size={15} /> Trang thiết bị ({assets.length})</h3>
              {assets.length ? assets.map((e) => (
                <div className="org-chart-asset-row" key={e.id}>
                  <span>{e.equipment_name}{e.model_code ? ` · ${e.model_code}` : ""}</span>
                  <span className={`status-badge ${EQUIPMENT_STATUS_TONE[e.status] || "muted"}`}>{EQUIPMENT_STATUS_LABEL[e.status] || e.status}</span>
                </div>
              )) : <div className="empty-state">Chưa có trang thiết bị nào gắn đơn vị này.</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
