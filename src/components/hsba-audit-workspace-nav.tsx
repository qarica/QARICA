"use client";
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

  return (
    <div>
      <div className="emr-workspace-nav hsba-type-switch" aria-label="Chọn loại audit">
        <div className="emr-workspace-nav-rail">
          {INTERNAL_AUDIT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`emr-tab ${auditType === type ? "active" : ""}`}
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
      <nav className="emr-workspace-nav" aria-label="Điều hướng Audit nội bộ KHTH">
        <div className="emr-workspace-nav-rail">
          {DESTINATIONS.map((d) => {
            const href = `${d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit"}?type=${auditType}`;
            const active = pathname === (d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit");
            return (
              <Link key={href} href={href} className={`emr-tab ${active ? "active" : ""}`}>
                {d.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <style jsx>{`
        .emr-workspace-nav {
          background: #fff;
          border: 1px solid #e5eaf2;
          border-radius: 14px;
          padding: 6px;
          margin-bottom: 2px;
        }
        .hsba-type-switch {
          margin-bottom: 8px;
        }
        .emr-workspace-nav-rail {
          display: flex;
          gap: 4px;
          overflow-x: auto;
        }
        .emr-tab {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          padding: 9px 13px;
          min-height: 40px;
          border-radius: 10px;
          color: #64748b;
          font-size: 12.5px;
          font-weight: 700;
          white-space: nowrap;
        }
        .emr-tab:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .emr-tab.active {
          background: #eff6ff;
          color: #1d4ed8;
        }
      `}</style>
    </div>
  );
}
