import { RegistryModulePage } from "@/components/registry-module-page";

export default function InspectionsPage() {
  return (
    <RegistryModulePage
      config={{
        eyebrow: "KẾ HOẠCH & ĐIỀU HÀNH",
        title: "Tiếp đoàn / Kiểm tra ngoài",
        description: "Quản lý đợt kiểm tra ngoài, mốc chuẩn bị trước - sau đoàn và liên kết Finding phát sinh.",
        permissions: ["inspections.view", "inspections.manage"],
        recordTypes: ["INSPECTION"],
        foundationNote: "Khung Inspection Mode đã được tạo để sau đó bổ sung countdown D-30, D-14, D-7, D-3, D-1, D và các việc sau đoàn mà không tách khỏi Finding/Action chung.",
      }}
    />
  );
}
