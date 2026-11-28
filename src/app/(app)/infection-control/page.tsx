import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { InfectionControlCasesClient } from "@/components/infection-control-cases-client";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NavGroupBar } from "@/components/nav-group-bar";

const SELECT = "id,department_id,patient_code,detected_date,infection_site,pathogen,related_procedure,status,notes,created_at,updated_at";

export default async function InfectionControlCasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // Bộ lọc từ thanh "Cần xử lý" (?status=...): chỉ lọc danh sách hiển thị, ô chỉ số tổng giữ nguyên.
  const statusRaw = String((await searchParams).status || "");
  const FILTER_LABEL: Record<string, string> = { NGHI_NGO: "Ca nghi ngờ chờ xác nhận" };
  const status = FILTER_LABEL[statusRaw] ? statusRaw : "";
  const { user } = await requireUserContext();
  requirePermission(user, "infection_control.view");
  const canManage = hasPermission(user, "infection_control.manage");
  const supabase = await createClient();

  const [departmentsRes, casesRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("organization_id", user.organizationId).eq("is_active", true).order("name"),
    supabase.from("infection_control_cases").select(SELECT).eq("organization_id", user.organizationId).order("detected_date", { ascending: false }),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Giám sát nhiễm khuẩn bệnh viện"
        description="Ghi nhận và theo dõi ca nhiễm khuẩn liên quan chăm sóc y tế (HAI) theo khoa/phòng. Phơi nhiễm nghề nghiệp/kim đâm ghi nhận ở module Sự cố & Phản ánh."
        icon="shield-alert"
      />
      <NavGroupBar group="infection-control" active="/infection-control" ariaLabel="Luồng việc Kiểm soát nhiễm khuẩn" emptyText="Không có ca nhiễm khuẩn nào chờ xác nhận." />
      {status ? <div className="scope-note">Đang lọc: <strong>{FILTER_LABEL[status]}</strong> · <Link className="table-link" href="/infection-control">Bỏ lọc</Link></div> : null}
      <InfectionControlCasesClient onlyStatus={status || undefined}
        departments={(departmentsRes.data ?? []) as any}
        initialCases={(casesRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
