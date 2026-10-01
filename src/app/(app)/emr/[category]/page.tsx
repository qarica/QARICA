import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmrCategoryClient } from "@/components/emr-category-client";
import { EmrCreateButton, EmrCreateProvider } from "@/components/emr-create-context";
import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";
import { emrCategoryBySlug } from "@/lib/emr-categories";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";

export default async function EmrCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const { category: slug } = await params;
  const category = emrCategoryBySlug(slug);
  if (!category) notFound();
  const canManage = hasPermission(user, "emr.manage");

  return (
    <EmrCreateProvider>
      <div className="page-stack">
        <PageHeader eyebrow="TRIỂN KHAI EMR" title={category.label} description={category.description} actions={<><a className="button secondary" href={`/api/emr/items/export?category=${category.code}`}>Xuất Excel</a>{category.code === "BIEU_MAU" ? <Link className="button secondary" href="/emr/bieu-mau/tree">Xem cây biểu mẫu</Link> : null}{canManage ? <EmrCreateButton label={category.label} /> : null}</>} icon={category.icon} />
        <EmrWorkspaceNav />
        <EmrCategoryClient categoryCode={category.code} categoryLabel={category.label} canManage={canManage} descriptionLabel={category.descriptionLabel} />
      </div>
    </EmrCreateProvider>
  );
}
