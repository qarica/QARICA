import { RegistryModulePage } from "@/components/registry-module-page";

export default function FmeaPage() {
  return (
    <RegistryModulePage
      config={{
        eyebrow: "QUẢN LÝ RỦI RO",
        title: "FMEA / HFMEA",
        description: "Phân tích quy trình, failure mode, nguyên nhân, hậu quả và mức ưu tiên để chủ động kiểm soát rủi ro trước khi xảy ra sự cố.",
        permissions: ["risk.view", "risk.manage"],
        recordTypes: ["FMEA"],
      }}
    />
  );
}
