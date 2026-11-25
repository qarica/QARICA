import { ProcedureTrainingsPageContent } from "@/components/procedure-trainings-page";

// Mục menu "Đào tạo": danh sách lớp + màn "Theo chủ đề". (Nội dung dùng chung với /tu-doc-hieu.)
export default async function ProcedureTrainingsPage() {
  return <ProcedureTrainingsPageContent mode="training" />;
}
