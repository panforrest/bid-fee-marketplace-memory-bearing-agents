import { createClient } from "@supabase/supabase-js";

// Server-ONLY admin client. Uses the service_role key and BYPASSES RLS.
// Never import this into a client component. Used for seeding, settlement,
// and the autonomous auto-bidder.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
