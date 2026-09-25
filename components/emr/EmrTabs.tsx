"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/emr", label: "Tổng quan" },
  { href: "/emr/bieu-mau", label: "Biểu mẫu theo khoa" },
  { href: "/emr/quy-trinh", label: "Quy trình - tài liệu" },
  { href: "/emr/thiet-bi-cntt", label: "Thiết bị CNTT" },
  { href: "/emr/thiet-bi-yte", label: "Thiết bị y tế" },
  { href: "/emr/chu-ky-so", label: "Chữ ký số" },
  { href: "/emr/dao-tao", label: "Đào tạo - bàn giao" },
  { href: "/emr/loi", label: "Lỗi / góp ý" },
  { href: "/emr/nhap-lieu", label: "Nhập liệu" },
] as const;

export default function EmrTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
              (active
                ? "bg-[#7B2D3B] text-white"
                : "text-slate-600 hover:bg-slate-100")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
