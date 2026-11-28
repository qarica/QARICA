import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PhysicianLicenseClient } from "@/components/physician-license-client";
import { hasPermission, requireUserContext, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NavGroupBar } from "@/components/nav-group-bar";

export default async function PhysicianLicensePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  // Bộ lọc từ thanh "Cần xử lý" (?filter=...): chỉ lọc danh sách hiển thị, ô chỉ số tổng giữ nguyên.
  const filterRaw = String((await searchParams).filter || "");
  const FILTER_LABEL: Record<string, string> = { overdue: "Hồ sơ quá hạn đăng ký", soon: "Hồ sơ đến hạn đăng ký trong 7 ngày" };
  const filter = FILTER_LABEL[filterRaw] ? filterRaw : "";
  const { user } = await requireUserContext();
  requirePermission(user, "physician_license.view");
  const canManage = hasPermission(user, "physician_license.manage");
  const supabase = await createClient();

  // A view-only account (physician_license.view, granted broadly to every
  // role that already had tasks.view when this module shipped) should only
  // see its own khoa/phòng's registrations — not every physician in the
  // hospital. Only physician_license.manage (Tổ Hành chính, who must track
  // compliance across the whole hospital) keeps the full organization list.
  let registrationsQuery = supabase
    .from("physician_license_registrations")
    .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes,credential_id")
    .eq("organization_id", user.organizationId)
    .order("deadline", { ascending: true })
    .limit(300);
  if (!canManage) {
    registrationsQuery = user.primaryDepartmentId ? registrationsQuery.eq("department_id", user.primaryDepartmentId) : registrationsQuery.eq("department_id", "00000000-0000-0000-0000-000000000000");
  }

  const [departmentsRes, registrationsRes, credentialsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    registrationsQuery,
    // Danh mục hồ sơ năng lực hành nghề của tổ chức, để liên kết chéo 1 đăng
    // ký hành nghề (cổng SYT/BHYT) với đúng hồ sơ GPHN/văn bằng của người đó.
    supabase.from("practitioner_credentials").select("id,full_name").eq("organization_id", user.organizationId).order("full_name"),
  ]);

  return (
    <div className="page-stack physician-license-page">
      <PageHeader
        title="Theo dõi hành nghề bác sĩ"
        description="Theo dõi hạn đăng ký hành nghề trên cổng SYT/BHYT cho từng bác sĩ — tránh xuất toán BHYT do sai/thiếu chứng chỉ hành nghề."
        icon="list-checks"
      />
      <NavGroupBar group="physician-license" active="/physician-license" ariaLabel="Luồng việc Quản lý hành nghề" emptyText="Không có hồ sơ hành nghề nào cần xử lý gấp." />
      {filter ? <div className="scope-note">Đang lọc: <strong>{FILTER_LABEL[filter]}</strong> · <Link className="table-link" href="/physician-license">Bỏ lọc</Link></div> : null}
      <PhysicianLicenseClient attention={(filter || undefined) as "overdue" | "soon" | undefined}
        departments={(departmentsRes.data ?? []) as any}
        initialRegistrations={(registrationsRes.data ?? []) as any}
        credentials={(credentialsRes.data ?? []) as any}
        canManage={canManage}
      />
    </div>
  );
}
