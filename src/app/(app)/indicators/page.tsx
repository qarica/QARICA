import { RegistryModulePage } from "@/components/registry-module-page";
import Link from "next/link";

export default function IndicatorsPage() {
  return (
    <><div className="page-stack"><Link className="button secondary" href="/catalogs" style={{ alignSelf: "flex-start" }}>Khai báo chỉ số chất lượng →</Link></div><RegistryModulePage
      config={{
        eyebrow: "ĐO LƯỜNG & GIÁM SÁT",
        title: "Chỉ số chất lượng",
        description: "Theo dõi chỉ số, kỳ đo, trạng thái dữ liệu và các hồ sơ đo lường trong năm.",
        permissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"],
        recordTypes: ["INDICATOR_MEASUREMENT"],
      }}
    /></>
  );
}
