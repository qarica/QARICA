import { redirect } from "next/navigation";

// Kho đã tách làm 2 menu: Kho hóa chất (/lab-supplies/hoa-chat) và Kho vật tư (/lab-supplies/vat-tu).
// Giữ route cũ để dấu trang/liên kết cũ không bị 404.
export default function LabSuppliesRedirect() {
  redirect("/lab-supplies/hoa-chat");
}
