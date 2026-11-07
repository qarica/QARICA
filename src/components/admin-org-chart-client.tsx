"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

type Department = {
  id: string;
  code: string | null;
  name: string;
  short_name: string | null;
  department_type: string | null;
  parent_department_id: string | null;
  is_active: boolean;
  floor_order: number | null;
  floor_label: string | null;
  room_label: string | null;
  area_sqm: number | null;
  bed_count: number | null;
  org_origin: string | null;
  org_summary: string | null;
};
type Person = { user_id: string; full_name: string | null; email: string | null; job_title: string | null; primary_department_id: string | null; is_active: boolean };
type Equipment = { id: string; equipment_name: string; model_code: string | null; status: "IN_USE" | "MAINTENANCE" | "INACTIVE"; department_id: string | null };

const TYPE_LABEL: Record<string, string> = { CLINICAL: "Lâm sàng", PARACLINICAL: "Cận lâm sàng", MANAGEMENT: "Quản lý", SUPPORT: "Hỗ trợ" };
const EQUIPMENT_STATUS_LABEL: Record<string, string> = { IN_USE: "Đang sử dụng", MAINTENANCE: "Bảo trì/Sửa chữa", INACTIVE: "Ngưng sử dụng" };
const EQUIPMENT_STATUS_TONE: Record<string, string> = { IN_USE: "success", MAINTENANCE: "warning", INACTIVE: "muted" };
// Báo cáo thực tế: "phải vẽ sơ đồ bố trí theo tầng" — tham khảo 1 sơ đồ mặt
// bằng (lưới khoa/phòng theo tầng, viền màu theo loại đơn vị: xanh=phòng
// chức năng/lãnh đạo, thường=khoa lâm sàng, đỏ=khoa cận lâm sàng, nét đứt=hỗ
// trợ/chưa rõ). Dùng đúng 4 department_type đã có, không bịa thêm phân loại.
const FLOOR_BOX_TONE_CLASS: Record<string, string> = { MANAGEMENT: "org-floor-box-mgmt", CLINICAL: "org-floor-box-clinical", PARACLINICAL: "org-floor-box-para", SUPPORT: "org-floor-box-support" };
const FLOOR_LEGEND: { tone: string; label: string }[] = [
  { tone: "org-floor-box-mgmt", label: "Phòng chức năng, lãnh đạo" },
  { tone: "org-floor-box-clinical", label: "Khoa lâm sàng" },
  { tone: "org-floor-box-para", label: "Khoa cận lâm sàng" },
  { tone: "org-floor-box-support", label: "Hỗ trợ / chưa phân loại" },
];

type FloorGroup = { key: string; label: string; order: number; departments: Department[] };

// Báo cáo thực tế: "Bổ sung sơ đồ này nữa" — tham khảo 1 sơ đồ phân cấp
// theo khối (Phòng chức năng / Khoa lâm sàng / Khoa cận lâm sàng-hỗ trợ),
// mỗi khoa hiện số giường + nguồn gốc (biên bản 2013 / lập mới theo QĐ 2018
// / chỉ có trong mặt bằng hoặc hồ sơ 2019). Trục màu ở đây là org_origin
// (lịch sử/pháp lý), KHÁC với trục màu department_type dùng ở sơ đồ tầng —
// 2 sơ đồ trả lời 2 câu hỏi khác nhau (ở đâu vs nguồn gốc nào), không gộp
// chung 1 bộ màu.
const ORG_ORIGIN_LABEL: Record<string, string> = { ESTABLISHED_2013: "Biên bản 2013", NEW_2018: "Lập mới theo QĐ 2018", PLAN_ONLY_2019: "Chỉ có trong mặt bằng hoặc hồ sơ 2019" };
const ORIGIN_BOX_TONE_CLASS: Record<string, string> = { ESTABLISHED_2013: "org-hier-box-established", NEW_2018: "org-hier-box-new", PLAN_ONLY_2019: "org-hier-box-planonly" };
const ORIGIN_LEGEND: { tone: string; label: string }[] = [
  { tone: "org-hier-box-established", label: ORG_ORIGIN_LABEL.ESTABLISHED_2013 },
  { tone: "org-hier-box-new", label: ORG_ORIGIN_LABEL.NEW_2018 },
  { tone: "org-hier-box-planonly", label: ORG_ORIGIN_LABEL.PLAN_ONLY_2019 },
];
const HIERARCHY_BLOCKS: { key: string; label: string; types: string[] }[] = [
  { key: "MANAGEMENT", label: "Phòng chức năng, lãnh đạo", types: ["MANAGEMENT"] },
  { key: "CLINICAL", label: "Khoa lâm sàng", types: ["CLINICAL"] },
  { key: "PARA_SUPPORT", label: "Khoa cận lâm sàng và hỗ trợ", types: ["PARACLINICAL", "SUPPORT"] },
];

function buildHierarchyBlocks(departments: Department[]): { key: string; label: string; departments: Department[] }[] {
  return HIERARCHY_BLOCKS.map((b) => ({
    key: b.key,
    label: b.label,
    departments: departments.filter((d) => b.types.includes(d.department_type || "")).sort((a, c) => a.name.localeCompare(c.name, "vi")),
  })).filter((b) => b.departments.length);
}

// Báo cáo thực tế: "Sơ đồ nên thể hiện cha con gần nhau trực quan" — trước
// đây mỗi tầng chỉ sort theo tên (A-Z phẳng), cha/con cùng tầng (vd Khoa Nhi
// + Đơn vị Sơ sinh, cùng ở Tầng 2) bị tách rời, chen giữa các đơn vị không
// liên quan. orderWithinFloor() gom con liền ngay sau cha NẾU cả hai cùng ở
// chung 1 tầng (chỉ xét quan hệ cha/con trong phạm vi departments của CHÍNH
// tầng đó, không phải toàn bộ cây) — con có cha ở tầng khác thì giữ nguyên vị
// trí theo tên, không gom được vì cha không ở cùng hàng để đặt cạnh.
function orderWithinFloor(depts: Department[]): Department[] {
  const idsInFloor = new Set(depts.map((d) => d.id));
  const childrenOf = new Map<string, Department[]>();
  const roots: Department[] = [];
  for (const d of depts) {
    const parentInFloor = d.parent_department_id && idsInFloor.has(d.parent_department_id) ? d.parent_department_id : null;
    if (!parentInFloor) {
      roots.push(d);
      continue;
    }
    const list = childrenOf.get(parentInFloor) ?? [];
    list.push(d);
    childrenOf.set(parentInFloor, list);
  }
  const out: Department[] = [];
  const visit = (d: Department) => {
    out.push(d);
    for (const child of (childrenOf.get(d.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "vi"))) visit(child);
  };
  for (const root of roots.sort((a, b) => a.name.localeCompare(b.name, "vi"))) visit(root);
  return out;
}

function buildFloorGroups(departments: Department[]): FloorGroup[] {
  const groups = new Map<string, FloorGroup>();
  const unassigned: Department[] = [];
  for (const d of departments) {
    if (!d.floor_label) {
      unassigned.push(d);
      continue;
    }
    const group = groups.get(d.floor_label) ?? { key: d.floor_label, label: d.floor_label, order: d.floor_order ?? Number.NEGATIVE_INFINITY, departments: [] };
    group.departments.push(d);
    groups.set(d.floor_label, group);
  }
  const sorted = Array.from(groups.values())
    .map((g) => ({ ...g, departments: orderWithinFloor(g.departments) }))
    .sort((a, b) => b.order - a.order);
  if (unassigned.length) sorted.push({ key: "__unassigned", label: "Chưa gắn tầng", order: Number.NEGATIVE_INFINITY, departments: orderWithinFloor(unassigned) });
  return sorted;
}

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
  const [floorOpen, setFloorOpen] = useState(true);
  const [hierOpen, setHierOpen] = useState(true);

  const tree = useMemo(() => buildTree(departments.filter((d) => showInactive || d.is_active || d.id === selectedId)), [departments, showInactive, selectedId]);
  const floorGroups = useMemo(() => buildFloorGroups(departments.filter((d) => showInactive || d.is_active)), [departments, showInactive]);
  const hasFloorData = departments.some((d) => d.floor_label);
  const hierarchyBlocks = useMemo(() => buildHierarchyBlocks(departments.filter((d) => showInactive || d.is_active)), [departments, showInactive]);
  const hasHierarchyData = departments.some((d) => d.org_origin || d.bed_count != null || d.org_summary);
  const departmentById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
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
        .org-chart-layout > * { min-width:0; }
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
        .org-floor-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; background: none; border: none; cursor: pointer; padding: 16px; text-align: left; }
        .org-floor-head h2 { margin: 0; font-size: 15px; }
        .org-floor-chevron { transition: transform 0.15s; }
        .org-floor-chevron.is-open { transform: rotate(180deg); }
        .org-floor-legend { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 16px 14px; font-size: 12px; color: #64748b; }
        .org-floor-legend-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin-right: 6px; vertical-align: middle; border: 1.5px solid #cbd5e1; background: #fff; }
        .org-floor-legend-swatch.org-floor-box-mgmt { border-color: #1D4ED8; background: #EEF2FF; }
        .org-floor-legend-swatch.org-floor-box-clinical { border-color: #cbd5e1; background: #fff; }
        .org-floor-legend-swatch.org-floor-box-para { border-color: #dc2626; background: #FEE2E2; }
        .org-floor-legend-swatch.org-floor-box-support { border-color: #94a3b8; border-style: dashed; background: #fff; }
        .org-floor-body { padding: 0 16px 16px; display: grid; gap: 10px; }
        .org-floor-row { display: grid; grid-template-columns: 90px 1fr; gap: 12px; align-items: start; }
        .org-floor-row > * { min-width:0; }
        @media (max-width: 760px) { .org-floor-row { grid-template-columns: 1fr; } }
        .org-floor-row-label { font-weight: 700; font-size: 13px; color: #334155; padding-top: 10px; }
        .org-floor-boxes { display: flex; flex-wrap: wrap; gap: 8px; }
        .org-floor-box { flex: 1 1 170px; max-width: 260px; text-align: left; border-radius: 10px; background: #fff; padding: 8px 10px; cursor: pointer; border: 1.5px solid #cbd5e1; display: grid; gap: 3px; }
        .org-floor-box strong { font-size: 12.5px; }
        .org-floor-box small { color: #64748b; font-size: 11px; }
        .org-floor-box.is-selected { background: var(--brand-soft); }
        .org-floor-box.is-child-here { margin-left: 14px; border-left-width: 3px; background: #f8fafc; }
        .org-floor-box-parent-hint { font-style: italic; }
        .org-floor-box-mgmt { border-color: #1D4ED8; }
        .org-floor-box-clinical { border-color: #cbd5e1; }
        .org-floor-box-para { border-color: #dc2626; }
        .org-floor-box-support { border-style: dashed; border-color: #94a3b8; }
        .org-hier-box-established { border-color: #cbd5e1; }
        .org-hier-box-new { border-color: #1D4ED8; }
        .org-hier-box-planonly { border-style: dashed; border-color: #94a3b8; }
        .org-floor-legend-swatch.org-hier-box-established { border-color: #cbd5e1; background: #fff; }
        .org-floor-legend-swatch.org-hier-box-new { border-color: #1D4ED8; background: #EEF2FF; }
        .org-floor-legend-swatch.org-hier-box-planonly { border-color: #94a3b8; border-style: dashed; background: #fff; }
        .org-chart-full-width { grid-column: 1 / -1; }
      `}</style>

      <section className="panel org-chart-full-width">
        <button type="button" className="org-floor-head" onClick={() => setFloorOpen((v) => !v)}>
          <h2>Sơ đồ bố trí theo tầng</h2>
          <Icon name="chevron-down" size={18} className={`org-floor-chevron${floorOpen ? " is-open" : ""}`} />
        </button>
        {floorOpen ? (
          hasFloorData ? (
            <>
              <div className="org-floor-legend">
                {FLOOR_LEGEND.map((l) => (
                  <span key={l.tone}><span className={`org-floor-legend-swatch ${l.tone}`} />{l.label}</span>
                ))}
              </div>
              <div className="org-floor-body">
                {floorGroups.map((group) => (
                  <div className="org-floor-row" key={group.key}>
                    <div className="org-floor-row-label">{group.label}</div>
                    <div className="org-floor-boxes">
                      {group.departments.map((d) => {
                        const parent = d.parent_department_id ? departmentById.get(d.parent_department_id) ?? null : null;
                        const parentSameFloor = !!parent && group.departments.some((x) => x.id === parent.id);
                        return (
                          <button
                            type="button"
                            key={d.id}
                            className={`org-floor-box ${FLOOR_BOX_TONE_CLASS[d.department_type || ""] || "org-floor-box-support"}${selectedId === d.id ? " is-selected" : ""}${parentSameFloor ? " is-child-here" : ""}`}
                            onClick={() => setSelectedId(d.id)}
                          >
                            <strong>{parentSameFloor ? "↳ " : ""}{d.name}</strong>
                            {d.room_label || d.area_sqm != null ? <small>{[d.room_label, d.area_sqm != null ? `${d.area_sqm} m²` : null].filter(Boolean).join(" · ")}</small> : null}
                            {parent && !parentSameFloor ? <small className="org-floor-box-parent-hint">— thuộc {parent.name}{parent.floor_label ? `, ${parent.floor_label}` : ""}</small> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ margin: "0 16px 16px" }}>
              Chưa có đơn vị nào khai báo tầng/phòng. Vào trang Khoa/Phòng → Sửa để nhập Thứ tự tầng, Tên tầng, Phòng/vị trí, Diện tích cho từng đơn vị.
            </div>
          )
        ) : null}
      </section>

      <section className="panel org-chart-full-width">
        <button type="button" className="org-floor-head" onClick={() => setHierOpen((v) => !v)}>
          <h2>Sơ đồ phân cấp theo khối</h2>
          <Icon name="chevron-down" size={18} className={`org-floor-chevron${hierOpen ? " is-open" : ""}`} />
        </button>
        {hierOpen ? (
          hasHierarchyData ? (
            <>
              <div className="org-floor-legend">
                {ORIGIN_LEGEND.map((l) => (
                  <span key={l.tone}><span className={`org-floor-legend-swatch ${l.tone}`} />{l.label}</span>
                ))}
              </div>
              <div className="org-floor-body">
                {hierarchyBlocks.map((block) => (
                  <div className="org-floor-row" key={block.key}>
                    <div className="org-floor-row-label">{block.label}</div>
                    <div className="org-floor-boxes">
                      {block.departments.map((d) => (
                        <button
                          type="button"
                          key={d.id}
                          className={`org-floor-box ${ORIGIN_BOX_TONE_CLASS[d.org_origin || ""] || "org-hier-box-established"}${selectedId === d.id ? " is-selected" : ""}`}
                          onClick={() => setSelectedId(d.id)}
                        >
                          <strong>{d.name}{d.bed_count != null ? ` · ${d.bed_count === 0 ? "Không giường" : `${d.bed_count} giường`}` : ""}</strong>
                          {d.org_summary ? <small>{d.org_summary}</small> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ margin: "0 16px 16px" }}>
              Chưa có đơn vị nào khai báo số giường/nguồn gốc. Vào trang Khoa/Phòng → Sửa để nhập Số giường, Nguồn gốc, Mô tả cơ cấu cho từng đơn vị.
            </div>
          )
        ) : null}
      </section>

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
