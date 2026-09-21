import { RegistryModulePage } from "@/components/registry-module-page";

export default function FeedbackPage() {
  return <RegistryModulePage config={{
    eyebrow: "BÁO CÁO & PHÂN TÍCH",
    title: "Ý kiến khách hàng",
    description: "Tiếp nhận, phân loại, xử lý và phản hồi ý kiến khách hàng; chỉ chuyển Finding, Action hoặc CAPA khi xác minh có vấn đề hệ thống.",
    permissions: ["feedback.view", "feedback.manage"],
    recordTypes: ["FEEDBACK"],
  }} />;
}
