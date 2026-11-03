import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client: omzeilt RLS. Alleen gebruiken in de Stripe-webhook en de
 * cron-route, nooit met invoer die niet eerst gecontroleerd is.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
