import { redirect } from "next/navigation";
import { ProcedureTrainingsPageContent } from "@/components/procedure-trainings-page";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";

// Mục menu "Đào tạo": danh sách lớp + màn "Theo chủ đề". (Nội dung dùng chung với /tu-doc-hieu.)
export default async function ProcedureTrainingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["procedure_training.view", "document_publication.view"])) redirect("/dashboard?forbidden=1");
  const status = (await searchParams).status === "NOT_PLANNED" ? "NOT_PLANNED" : undefined;
  return <ProcedureTrainingsPageContent mode="training" initialStatusFilter={status} />;
}
