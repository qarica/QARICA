import { RegistryModulePage } from "@/components/registry-module-page";

export default function FeedbackPage() {
  return <RegistryModulePage config={{
    eyebrow: "BÁO CÁO & PHÂN TÍCH",
    title: "Phản ánh / Góp ý",
    description: "Ghi nhận phản ánh, góp ý và các hồ sơ cần chuyển tiếp thành Finding, Action hoặc CAPA khi phù hợp.",
    permissions: ["feedback.view", "feedback.manage"],
    recordTypes: ["FEEDBACK"],
  }} />;
}
