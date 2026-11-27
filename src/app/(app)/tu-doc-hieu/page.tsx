import { redirect } from "next/navigation";
import { ProcedureTrainingsPageContent } from "@/components/procedure-trainings-page";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";

// Mục menu "Tự đọc hiểu": theo dõi tài liệu phổ biến theo hình thức tự đọc hiểu (xác nhận qua QR/link).
export default async function SelfReadPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["procedure_training.view", "document_publication.view"])) redirect("/dashboard?forbidden=1");
  return <ProcedureTrainingsPageContent mode="self_read" />;
}
