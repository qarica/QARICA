import { RegistryModulePage } from "@/components/registry-module-page";

export default function FindingsPage() {
  return (
    <RegistryModulePage
      config={{
        eyebrow: "ĐO LƯỜNG & GIÁM SÁT",
        title: "Findings",
        description: "Theo dõi điểm không phù hợp từ giám sát, audit, phản ánh hoặc kiểm tra ngoài đến khi được xác minh đóng.",
        permissions: ["findings.view", "findings.manage"],
        recordTypes: ["FINDING"],
        foundationNote: "Finding dùng chung cho mọi nguồn và sẽ đi tiếp theo luồng Finding → Action → Evidence → Recheck; không tạo module tồn tại sau kiểm tra riêng.",
      }}
    />
  );
}
