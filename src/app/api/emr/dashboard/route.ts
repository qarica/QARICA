import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

export async function GET() {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data: profile, error: pe } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (pe) return NextResponse.json({ error: pe.message }, { status: 400 });
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });
  const { data, error } = await admin.from("emr_rollout_items")
    .select("id,category,title,description,status,department_id,owner_user_id,due_date,priority,is_go_live_gate,evidence_url,verified_at,created_at,updated_at")
    .eq("organization_id", profile.organization_id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const items = data ?? [];
  const now = Date.now();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0, BLOCKED: 0 } as Record<string, number>;
  items.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
  const categories = EMR_CATEGORIES.map(c => {
    const rows = items.filter(x => x.category === c.code);
    const done = rows.filter(x => x.status === "DONE").length;
    const blocked = rows.filter(x => x.status === "BLOCKED").length;
    return { ...c, total: rows.length, done, blocked, completion: rows.length ? Math.round(done * 100 / rows.length) : null };
  });
  const overdue = items.filter(x => x.status !== "DONE" && x.due_date && x.due_date < today).length;
  const gates = items.filter(x => x.is_go_live_gate);
  const gatesPassed = gates.filter(x => x.status === "DONE" && !!x.evidence_url && !!x.verified_at).length;
  const unassigned = items.filter(x => x.status !== "DONE" && (!x.owner_user_id || !x.department_id)).length;
  const criticalOpen = items.filter(x => x.status !== "DONE" && x.priority === "CRITICAL").length;
  const gateEvidenceMissing = gates.filter(x => x.status === "DONE" && (!x.evidence_url || !x.verified_at)).length;
  const stale = items.filter(x => x.status !== "DONE" && now - new Date(x.updated_at).getTime() > 7 * 86400000).length;

  const { data: departments, error: de } = await admin.from("departments")
    .select("id,name,short_name").eq("organization_id", profile.organization_id).eq("is_active", true).order("name");
  if (de) return NextResponse.json({ error: de.message }, { status: 400 });

  const departmentMatrix = (departments ?? []).map(d => {
    const rows = items.filter(x => x.department_id === d.id);
    const doneRows = rows.filter(x => x.status === "DONE").length;
    const openRows = rows.filter(x => x.status !== "DONE");
    const overdueRows = openRows.filter(x => x.due_date && x.due_date < today).length;
    const blockers = openRows.filter(x => x.status === "BLOCKED").length;
    const gateRows = rows.filter(x => x.is_go_live_gate);
    const passedGates = gateRows.filter(x => x.status === "DONE" && !!x.evidence_url && !!x.verified_at).length;
    const domains = EMR_CATEGORIES.map(c => {
      const domainRows = rows.filter(x => x.category === c.code);
      const domainDone = domainRows.filter(x => x.status === "DONE").length;
      return { code:c.code, slug:c.slug, label:c.label, total:domainRows.length, done:domainDone, blocked:domainRows.filter(x => x.status === "BLOCKED").length, completion:domainRows.length ? Math.round(domainDone*100/domainRows.length) : null };
    });
    return { id:d.id, name:d.short_name || d.name, total:rows.length, done:doneRows, open:openRows.length, overdue:overdueRows, blockers, gates:gateRows.length, gatesPassed:passedGates, completion:rows.length ? Math.round(doneRows*100/rows.length) : null, domains };
  }).filter(d => d.total > 0).sort((a,b) => b.blockers-a.blockers || b.overdue-a.overdue || (a.completion ?? 101)-(b.completion ?? 101));

  const upcoming = items.filter(x => x.status !== "DONE" && x.due_date && x.due_date >= today)
    .sort((a,b) => String(a.due_date).localeCompare(String(b.due_date))).slice(0,6);

  const escalation = items.filter(x => x.status !== "DONE").map(x => {
    const isOverdue = !!x.due_date && x.due_date < today;
    const isStale = now - new Date(x.updated_at).getTime() > 7 * 86400000;
    const reasons = [x.status === "BLOCKED" ? "BLOCKED" : null, x.priority === "CRITICAL" ? "CRITICAL" : null, isOverdue ? "OVERDUE" : null, x.is_go_live_gate ? "GO_LIVE_GATE" : null, !x.owner_user_id ? "NO_OWNER" : null, isStale ? "STALE" : null].filter(Boolean);
    const score = (x.status === "BLOCKED" ? 50 : 0) + (x.priority === "CRITICAL" ? 40 : 0) + (isOverdue ? 30 : 0) + (x.is_go_live_gate ? 20 : 0) + (!x.owner_user_id ? 10 : 0) + (isStale ? 5 : 0);
    return { ...x, reasons, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || new Date(a.updated_at).getTime()-new Date(b.updated_at).getTime()).slice(0,10);

  const openItems = items.filter(x => x.status !== "DONE");
  const controlCoverage = {
    owner: openItems.length ? Math.round(openItems.filter(x => !!x.owner_user_id).length * 100 / openItems.length) : 100,
    department: openItems.length ? Math.round(openItems.filter(x => !!x.department_id).length * 100 / openItems.length) : 100,
    deadline: openItems.length ? Math.round(openItems.filter(x => !!x.due_date).length * 100 / openItems.length) : 100,
    gateEvidence: gates.filter(x => x.status === "DONE").length ? Math.round(gates.filter(x => x.status === "DONE" && !!x.evidence_url && !!x.verified_at).length * 100 / gates.filter(x => x.status === "DONE").length) : 100,
  };

  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), total: items.length, counts, completion: items.length ? Math.round(counts.DONE * 100 / items.length) : 0, categories, stale, overdue, unassigned, criticalOpen, controlCoverage, gates: { total: gates.length, passed: gatesPassed, evidenceMissing: gateEvidenceMissing }, departmentMatrix, upcoming, escalation, attention: items.filter(x => x.status === "BLOCKED" || x.priority === "CRITICAL" || (x.due_date && x.status !== "DONE" && x.due_date < today) || x.status === "TODO").slice(0, 8) });
}
