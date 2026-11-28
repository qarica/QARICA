import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProcurementRequestsClient } from "@/components/procurement-requests-client";
import { hasPermission, requireUserContext, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NavGroupBar } from "@/components/nav-group-bar";

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  // Bộ lọc từ thanh "Cần xử lý" (?filter=...): chỉ lọc danh sách hiển thị, ô chỉ số tổng giữ nguyên.
  const filterRaw = String((await searchParams).filter || "");
  const FILTER_LABEL: Record<string, string> = { bgd: "Đề xuất chờ BGĐ duyệt", tgd: "Đề xuất BGĐ đã duyệt — chờ TGĐ" };
  const filter = FILTER_LABEL[filterRaw] ? filterRaw : "";
  const { user } = await requireUserContext();
  requirePermission(user, "procurement.view");
  const canManage = hasPermission(user, "procurement.manage");
  const canApproveBgd = hasPermission(user, "procurement.approve_bgd");
  const canApproveTgd = hasPermission(user, "procurement.approve_tgd");
  const supabase = await createClient();

  const [departmentsRes, requestsRes] = await Promise.all([
    supabase.from("departments").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("procurement_requests")
      .select(
        "id,department_id,request_type,urgency,title,description,quantity,unit_price,estimated_cost,submitted_by,submitted_at,status,bgd_decided_at,bgd_note,tgd_decided_at,tgd_note,notified_at",
      )
      .eq("organization_id", user.organizationId)
      .order("submitted_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="page-stack procurement-page">
      <PageHeader
        title="Đề xuất mua sắm / sửa chữa"
        description="Tiếp nhận đề xuất từ khoa/phòng, duyệt 2 cấp (BGĐ → TGĐ) và thông báo kết quả."
        icon="list-checks"
      />
      <NavGroupBar group="procurement" active="/procurement" ariaLabel="Đề xuất cần xử lý" emptyText="Không có đề xuất nào chờ duyệt." />
      {filter ? <div className="scope-note">Đang lọc: <strong>{FILTER_LABEL[filter]}</strong> · <Link className="table-link" href="/procurement">Bỏ lọc</Link></div> : null}
      <ProcurementRequestsClient attention={(filter || undefined) as "bgd" | "tgd" | undefined}
        departments={(departmentsRes.data ?? []) as any}
        initialRequests={(requestsRes.data ?? []) as any}
        canManage={canManage}
        canApproveBgd={canApproveBgd}
        canApproveTgd={canApproveTgd}
      />
    </div>
  );
}
