"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { GROUP_TONES, MODULE_DESCRIPTIONS, TILE_TONES } from "@/lib/module-catalog";
import type { NavGroup } from "@/lib/types";

export function ModuleCatalogClient({ groups }: { groups: NavGroup[] }) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, children: g.children.filter((c) => c.label.toLowerCase().includes(q)) }))
      .filter((g) => g.children.length > 0);
  }, [groups, search]);

  // Đếm liên tục qua mọi nhóm (không reset theo từng nhóm) để lưới nhiều màu
  // xen kẽ tự nhiên như bản tham khảo, thay vì lặp lại đúng 1 thứ tự màu ở
  // đầu mỗi nhóm.
  let tileIndex = 0;

  return (
    <>
      <div className="search-box module-catalog-search">
        <Icon name="search" size={18} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm module..." aria-label="Tìm module" />
      </div>
      <div className="module-catalog">
        {filteredGroups.map((g, i) => (
          <section className="panel module-catalog-group" key={g.id}>
            <div className="module-catalog-group-head">
              <span className={`module-catalog-badge tone-${GROUP_TONES[i % GROUP_TONES.length]}`}>
                <Icon name={g.icon} size={20} />
              </span>
              <h2>{g.label}</h2>
            </div>
            <div className="module-catalog-grid">
              {g.children.map((c) => {
                const tone = TILE_TONES[tileIndex % TILE_TONES.length];
                tileIndex += 1;
                return (
                  <Link href={c.href} className="module-catalog-tile" key={`${g.id}-${c.label}`}>
                    <span className={`module-catalog-tile-icon tone-${tone}`}>
                      <Icon name={c.icon} size={18} />
                    </span>
                    <span className="module-catalog-tile-copy">
                      <strong>{c.label}</strong>
                      {MODULE_DESCRIPTIONS[c.label] ? <small>{MODULE_DESCRIPTIONS[c.label]}</small> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {!filteredGroups.length ? <div className="empty-state">Không tìm thấy module phù hợp.</div> : null}
      </div>
      <style>{`
        .module-catalog-search{margin-bottom:16px;max-width:420px}
        .module-catalog{display:flex;flex-direction:column;gap:16px}
        .module-catalog-group-head{display:flex;align-items:center;gap:12px;padding:18px 19px 4px}
        .module-catalog-group-head h2{margin:0;font-size:16px}
        .module-catalog-badge{width:38px;height:38px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 38px}
        .module-catalog-badge.tone-brand{background:var(--brand-soft);color:var(--brand)}
        .module-catalog-badge.tone-info{background:var(--info-soft);color:var(--info)}
        .module-catalog-badge.tone-success{background:var(--success-soft);color:var(--success)}
        .module-catalog-badge.tone-warning{background:var(--warning-soft);color:var(--warning)}
        .module-catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px;padding:10px 12px 19px}
        .module-catalog-tile{display:flex;align-items:flex-start;gap:11px;padding:11px 12px;border-radius:12px;min-width:0}
        .module-catalog-tile:hover{background:#f6f9fb}
        .module-catalog-tile-icon{width:34px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px}
        .module-catalog-tile-icon.tone-brand{background:var(--brand-soft);color:var(--brand)}
        .module-catalog-tile-icon.tone-info{background:var(--info-soft);color:var(--info)}
        .module-catalog-tile-icon.tone-success{background:var(--success-soft);color:var(--success)}
        .module-catalog-tile-icon.tone-warning{background:var(--warning-soft);color:var(--warning)}
        .module-catalog-tile-icon.tone-danger{background:var(--danger-soft);color:var(--danger)}
        .module-catalog-tile-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
        .module-catalog-tile-copy strong{font-size:12.5px;color:var(--text)}
        .module-catalog-tile-copy small{font-size:11px;color:var(--muted);line-height:1.4}
        @media(max-width:620px){.module-catalog-grid{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}
