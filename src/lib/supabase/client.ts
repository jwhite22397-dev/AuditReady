import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./env";

export function createSupabaseBrowserClient(): SupabaseClient {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return createBrowserClient(config.url, config.anonKey);
}
