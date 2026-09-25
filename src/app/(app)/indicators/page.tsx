import Link from "next/link";
import { RegistryModulePage } from "@/components/registry-module-page";

export default function IndicatorsPage() {
  return (
    <div className="page-stack">
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <Link className="button secondary" href="/indicators/manage">Quản lý chỉ số</Link>
      </div>
      <RegistryModulePage
        config={{
          eyebrow: "ĐO LƯỜNG & GIÁM SÁT",
          title: "Chỉ số chất lượng",
          description: "Theo dõi chỉ số, kỳ đo, trạng thái dữ liệu và các hồ sơ đo lường trong năm.",
          permissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"],
          recordTypes: ["INDICATOR_MEASUREMENT"],
        }}
      />
    </div>
  );
}
