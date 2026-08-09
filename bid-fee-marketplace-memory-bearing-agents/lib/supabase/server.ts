import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client for Server Components / Route Handlers.
// Uses the public anon key for RLS-protected PUBLIC reads (lot grid, auction
// state). User-scoped actions (place_bid, wallet) run through the browser
// client, which carries the anonymous-auth session.
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
