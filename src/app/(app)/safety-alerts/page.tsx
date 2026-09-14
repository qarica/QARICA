import { RegistryModulePage } from "@/components/registry-module-page";

export default function SafetyAlertsPage() {
  return <RegistryModulePage config={{
    eyebrow: "BÁO CÁO & PHÂN TÍCH",
    title: "Kho bài học / Cảnh báo",
    description: "Tập hợp bài học và cảnh báo an toàn đã được phát hành từ các nguồn sự cố, giám sát và đánh giá.",
    permissions: ["incident.view_summary", "incident.view_case"],
    recordTypes: ["SAFETY_ALERT"],
  }} />;
}
