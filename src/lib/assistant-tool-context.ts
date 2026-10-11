import type{SupabaseClient}from"@supabase/supabase-js";import type{UserContext}from"@/lib/types";
export type ToolContext={supabase:SupabaseClient;user:UserContext};
export function safeLimit(v:unknown,fallback=10){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(Math.floor(n),50)):fallback;}
