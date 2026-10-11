import { cache } from "react";
import { redirect } from "next/navigation";
import { loadRequestContext } from "@/lib/request-context";
import { createClient } from "@/lib/supabase/server";
import type { UserContext } from "@/lib/types";

export const requireUserContext = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    console.error("[requireUserContext] auth claims failed:", claimsError.message);
    redirect("/login");
  }
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const authEmail = typeof (claims as { email?: unknown } | undefined)?.email === "string"
    ? ((claims as { email?: string }).email ?? null)
    : null;
  if (!userId) redirect("/login");

  try {
    return await loadRequestContext(supabase, userId, authEmail);
  } catch (error) {
    console.error("[requireUserContext] request context failed:", error);
    throw error;
  }
});

export function hasPermission(user: UserContext, code: string) {
  return user.permissions.includes(code);
}

export function hasAnyPermission(user: UserContext, codes: string[]) {
  return codes.some((code) => user.permissions.includes(code));
}

export function requirePermission(user: UserContext, code: string) {
  if (!hasPermission(user, code)) redirect("/dashboard?forbidden=1");
}
