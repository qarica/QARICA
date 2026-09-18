import { redirect } from "next/navigation";
import { CatalogsClient } from "@/components/catalogs-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogsPage() {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["criteria.view", "criteria.manage", "indicators.view", "indicators.manage", "checklists.view", "checklists.manage"])) redirect("/dashboard?forbidden=1");
  const db = await createClient();
  const [sets, indicators, checklists] = await Promise.all([
    db.from("criteria_sets").select("id,code,name,description,is_active").eq("organization_id", user.organizationId).order("name"),
    db.from("indicator_definitions").select("id,code,name,purpose,is_active").eq("organization_id", user.organizationId).order("name"),
    db.from("checklist_templates").select("id,code,internal_code,name,source_code,is_active").eq("organization_id", user.organizationId).order("name"),
  ]);
  const setIds = (sets.data || []).map(row => row.id);
  const indicatorIds = (indicators.data || []).map(row => row.id);
  const [setVersions, indicatorVersions] = await Promise.all([
    setIds.length ? db.from("criteria_set_versions").select("id,criteria_set_id,version_no,status").in("criteria_set_id", setIds).order("version_no", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    indicatorIds.length ? db.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,status,unit,frequency,calculation_type,desired_direction,multiplier").in("indicator_definition_id", indicatorIds).order("version_no", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const versions = (setVersions.data || []) as { id: string; criteria_set_id: string; version_no: number; status: string }[];
  const versionIds = versions.map(row => row.id);
  const items = versionIds.length ? await db.from("criteria_items").select("id,criteria_version_id,code,title,description,parent_criteria_item_id,item_type,is_active,sequence_no").in("criteria_version_id", versionIds).order("sequence_no") : { data: [], error: null };
  const errors = [sets.error, indicators.error, checklists.error, setVersions.error, indicatorVersions.error, items.error].filter(Boolean);
  return <div className="page-stack"><div className="page-header"><div><div className="eyebrow">CẤU HÌNH CHẤT LƯỢNG</div><h1>Danh mục tiêu chí, chỉ số & bảng kiểm</h1><p>Khai báo một lần để dùng trong kế hoạch, tự đánh giá và giám sát.</p></div></div>
    {errors.length ? <div className="alert error">Không tải đủ danh mục: {errors[0]?.message}</div> : null}
    <CatalogsClient sets={sets.data || []} setVersions={versions} items={items.data || []} indicators={indicators.data || []} indicatorVersions={indicatorVersions.data || []} checklists={checklists.data || []} canCriteria={user.permissions.includes("criteria.manage")} canIndicator={user.permissions.includes("indicators.manage")} canChecklist={user.permissions.includes("checklists.manage")} />
  </div>;
}
