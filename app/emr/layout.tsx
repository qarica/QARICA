import type { ReactNode } from "react";
import EmrTabs from "../../components/emr/EmrTabs";

export const metadata = {
  title: "EMR Dashboard | QARICA",
};

export default function EmrLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">EMR Rollout Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Theo dõi chi tiết tiến độ số hóa biểu mẫu, thiết bị, chữ ký số, đào tạo và lỗi
          phát sinh trong quá trình triển khai bệnh án điện tử.
        </p>
      </header>
      <EmrTabs />
      <main className="mt-5">{children}</main>
    </div>
  );
}
