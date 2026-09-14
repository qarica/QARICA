import { cookies } from "next/headers";

export async function getWorkYear() {
  const store = await cookies();
  const raw = store.get("qlcl_work_year")?.value;
  const parsed = raw ? Number(raw) : NaN;
  const current = new Date().getFullYear();
  if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200) return parsed;
  return current;
}
