"use client";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INTERNAL_AUDIT_TYPES, INTERNAL_AUDIT_TYPE_LABEL, normalizeInternalAuditType } from "@/lib/internal-audit-types";

const DESTINATIONS = [
  { slug: "", label: "Tổng quan" },
  { slug: "checklist", label: "Bảng kiểm" },
  { slug: "report", label: "Báo cáo tháng" },
];

export function HsbaAuditWorkspaceNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auditType = normalizeInternalAuditType(searchParams.get("type"));

  // Inline styles instead of scoped <style jsx> — a real, previously
  // confirmed bug class in this codebase (see CLAUDE.md gotchas): styled-jsx
  // scoping is unreliable when another component elsewhere (emr-workspace-
  // nav.tsx) declares the exact same class names (.emr-workspace-nav,
  // .emr-tab) via its own <style jsx>. In production this second nav row
  // ("Tổng quan / Bảng kiểm / Báo cáo tháng") rendered as plain unstyled
  // text — real users couldn't tell it was clickable, so the "Bảng kiểm"
  // tab (where checklist items get declared) was invisible in practice.
  const panelStyle: CSSProperties = { background: "#fff", border: "1px solid #e5eaf2", borderRadius: 14, padding: 6, marginBottom: 2 };
  const railStyle: CSSProperties = { display: "flex", gap: 4, overflowX: "auto" };
  function tabStyle(active: boolean): CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: 7,
      flex: "0 0 auto",
      padding: "9px 13px",
      minHeight: 40,
      borderRadius: 10,
      color: active ? "#1d4ed8" : "#64748b",
      background: active ? "#eff6ff" : "transparent",
      fontSize: 12.5,
      fontWeight: 700,
      whiteSpace: "nowrap",
    };
  }

  return (
    <div>
      <div style={{ ...panelStyle, marginBottom: 8 }} aria-label="Chọn loại audit">
        <div style={railStyle}>
          {INTERNAL_AUDIT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              style={tabStyle(auditType === type)}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("type", type);
                router.push(`${pathname}?${params.toString()}`);
              }}
            >
              {INTERNAL_AUDIT_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </div>
      <nav style={panelStyle} aria-label="Điều hướng Audit nội bộ KHTH">
        <div style={railStyle}>
          {DESTINATIONS.map((d) => {
            const href = `${d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit"}?type=${auditType}`;
            const active = pathname === (d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit");
            return (
              <Link key={href} href={href} style={tabStyle(active)}>
                {d.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
