import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseKey, getPublicSupabaseUrl } from "@/lib/env";

export function createClient() {
  return createBrowserClient(getPublicSupabaseUrl(), getPublicSupabaseKey());
}
