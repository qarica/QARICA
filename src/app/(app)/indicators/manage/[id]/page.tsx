import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { IndicatorManageDetailClient } from "@/components/indicator-manage-detail-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function IndicatorManageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["indicators.enter", "indicators.manage"])) redirect("/dashboard?forbidden=1");
  const canManage = hasAnyPermission(user, ["indicators.manage"]);

  const { id } = await params;
  const supabase = await createClient();
  const { data: definition, error: defError } = await supabase.from("indicator_definitions").select("id,code,name,purpose,quality_dimension,is_active").eq("id", id).maybeSingle();
  if (defError) return <div className="alert error">Không tải được chỉ số: {defError.message}</div>;
  if (!definition) notFound();

  const { data: versions, error: versionsError } = await supabase.from("indicator_definition_versions").select("id,version_no,status,calculation_type,desired_direction,frequency,unit,multiplier,effective_from,effective_to").eq("indicator_definition_id", id).order("version_no", { ascending: false });

  return <div className="page-stack">
    <PageHeader eyebrow="CẤU HÌNH & DANH MỤC" title={definition.name} description={`Mã ${definition.code}${definition.quality_dimension ? ` · ${definition.quality_dimension}` : ""}`} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-secondary" href="/indicators/manage">← Quản lý chỉ số</Link></div>
    {versionsError ? <div className="alert error">Không tải được phiên bản: {versionsError.message}</div> : null}
    <IndicatorManageDetailClient definition={definition} versions={versions ?? []} canManage={canManage} />
  </div>;
}
