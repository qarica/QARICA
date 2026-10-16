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

  // Dùng chung class .module-tabs (module-modern.css/tqm-charts.css) thay vì
  // bảng màu/kiểu dáng riêng — đúng "format chung" mọi nơi khác trong app
  // đang dùng cho hàng tab (vd assessments "Quản lý bộ tiêu chí"). Trước đây
  // dùng inline style riêng để né lỗi <style jsx> không scope đúng khi trùng
  // tên class cục bộ với emr-workspace-nav.tsx (.emr-tab) — .module-tabs là
  // class CHUNG, định nghĩa 1 lần duy nhất trong CSS toàn cục (không phải
  // <style jsx>), nên không gặp lại lớp lỗi đó.
  return (
    <div className="page-stack" style={{ gap: 8 }}>
      <nav className="module-tabs" aria-label="Chọn loại audit">
        {INTERNAL_AUDIT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={auditType === type ? "active" : ""}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("type", type);
              router.push(`${pathname}?${params.toString()}`);
            }}
          >
            {INTERNAL_AUDIT_TYPE_LABEL[type]}
          </button>
        ))}
      </nav>
      <nav className="module-tabs" aria-label="Điều hướng Audit HSBA">
        {DESTINATIONS.map((d) => {
          const href = `${d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit"}?type=${auditType}`;
          const active = pathname === (d.slug ? `/hsba-audit/${d.slug}` : "/hsba-audit");
          return (
            <Link key={href} href={href} className={active ? "active" : ""}>
              {d.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
