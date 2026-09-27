import { EmrCommandCenter } from "@/components/emr-command-center";
import { requireUserContext, requirePermission } from "@/lib/auth";
export default async function EmrPage(){ const { user } = await requireUserContext(); requirePermission(user, "emr.view"); return <EmrCommandCenter/>; }
