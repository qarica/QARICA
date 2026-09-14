import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl, getServerSupabaseSecret } from "@/lib/env";

export function createAdminClient() {
  return createSupabaseClient(getPublicSupabaseUrl(), getServerSupabaseSecret(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
