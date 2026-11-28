import { indicatorAttentionRecordIds, MeasureWorkspaceBar } from "@/components/measure-workspace-bar";
import { RegistryModulePage, type RegistryRecordFilter } from "@/components/registry-module-page";
import { getWorkYear } from "@/lib/work-year";

export default async function IndicatorsPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const year = await getWorkYear();
  const { attention } = await searchParams;
  // Mục ở thanh Cần xử lý trỏ về đây (?attention=out|submitted|returned): lọc đúng các kỳ đo đó, cùng điều kiện với thanh.
  const hit = await indicatorAttentionRecordIds(attention);
  const recordFilter: RegistryRecordFilter | undefined = hit ? { recordIds: hit.ids, label: hit.label, clearHref: "/indicators" } : undefined;
  return (
    <div className="indicators-mobile-redesign">
      <RegistryModulePage
        config={{
          eyebrow: "ĐO LƯỜNG & GIÁM SÁT",
          icon: "gauge",
          title: "Chỉ số chất lượng",
          description: "Theo dõi chỉ số, kỳ đo, trạng thái dữ liệu và các hồ sơ đo lường trong năm.",
          permissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"],
          recordTypes: ["INDICATOR_MEASUREMENT"],
          tabs: [{ label: "Quản lý chỉ số", href: "/indicators/catalog" }],
        }}
        topSlot={<MeasureWorkspaceBar active="indicators" year={year} />}
        recordFilter={recordFilter}
      />
    </div>
  );
}
