import { PageHeader } from "@/components/page-header";
import { RiskScoreCalculatorClient } from "@/components/risk-score-calculator-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RiskScoreToolPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["risk.view", "risk.manage"])) redirect("/dashboard?forbidden=1");

  return <>
    <PageHeader
      eyebrow="Quản lý rủi ro"
      title="Thang điểm nguy cơ lâm sàng"
      description="Công cụ tính điểm nguy cơ dùng chung cho các thang điểm dạng chọn mức độ theo từng yếu tố (ví dụ: Braden). Tự động cộng điểm, phân loại mức nguy cơ và gợi ý can thiệp tương ứng."
    />
    <section className="panel" style={{ padding: 18 }}>
      <RiskScoreCalculatorClient />
    </section>
  </>;
}
