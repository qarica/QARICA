import { ProcedureTrainingsPageContent } from "@/components/procedure-trainings-page";

// Mục menu "Tự đọc hiểu": theo dõi tài liệu phổ biến theo hình thức tự đọc hiểu (xác nhận qua QR/link).
export default async function SelfReadPage() {
  return <ProcedureTrainingsPageContent mode="self_read" />;
}
