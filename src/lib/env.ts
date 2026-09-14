export function getPublicSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

export function getPublicSupabaseKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return value;
}

export function getServerSupabaseSecret() {
  const value =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!value) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (server only)",
    );
  }
  return value;
}
