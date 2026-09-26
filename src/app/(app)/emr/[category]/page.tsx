import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmrCategoryClient } from "@/components/emr-category-client";
import { emrCategoryBySlug } from "@/lib/emr-categories";
import { requireUserContext } from "@/lib/auth";

export default async function EmrCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  await requireUserContext(); // open to every authenticated user, no specific permission required
  const { category: slug } = await params;
  const category = emrCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <div className="page-stack">
      <PageHeader eyebrow="TRIỂN KHAI EMR" title={category.label} description={category.description} />
      <EmrCategoryClient categoryCode={category.code} categoryLabel={category.label} />
    </div>
  );
}
