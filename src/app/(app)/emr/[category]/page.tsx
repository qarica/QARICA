import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmrCategoryClient } from "@/components/emr-category-client";
import { EmrCreateButton, EmrCreateProvider } from "@/components/emr-create-context";
import { emrCategoryBySlug, type EmrKpiBucket } from "@/lib/emr-categories";
import { hasPermission, requirePermission, requireUserContext } from "@/lib/auth";

export default async function EmrCategoryPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ filter?: string }> }) {
  const { user } = await requireUserContext();
  requirePermission(user, "emr.view");
  const { category: slug } = await params;
  const category = emrCategoryBySlug(slug);
  if (!category) notFound();
  const canManage = hasPermission(user, "emr.manage");
  // Bộ lọc từ thanh "Cần xử lý" / ô chỉ số (?filter=BUCKET): chỉ lọc danh sách hiển thị, không đổi dữ liệu hay quyền.
  const BUCKETS: EmrKpiBucket[] = ["TOTAL", "DONE", "IN_PROGRESS", "TODO", "BLOCKED", "OVERDUE", "CERT_VALID", "CERT_EXPIRING", "CERT_EXPIRED"];
  const rawFilter = String((await searchParams).filter || "") as EmrKpiBucket;
  const attention = BUCKETS.includes(rawFilter) ? rawFilter : undefined;

  return (
    <EmrCreateProvider>
      <div className="page-stack">
        <PageHeader eyebrow="TRIỂN KHAI EMR" title={category.label} description={category.description} actions={<><a className="button secondary" href={`/api/emr/items/export?category=${category.code}`}>Xuất Excel</a>{canManage ? <EmrCreateButton label={category.label} /> : null}</>} icon={category.icon} />
        <EmrCategoryClient attention={attention} categoryCode={category.code} categoryLabel={category.label} canManage={canManage} descriptionLabel={category.descriptionLabel} />
      </div>
    </EmrCreateProvider>
  );
}
