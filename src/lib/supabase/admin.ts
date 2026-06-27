import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

// Service-role Supabase client — server-only. Bypasses RLS.
//
// Why this exists: the demo logs in via a cookie role-picker (no real Supabase
// auth session), so the anon client is blocked by RLS on writes (Storage upload
// + audio_recordings insert both return 403). Per clinical-governance rule A.3.4
// every artifact must be persisted server-side before any LLM call, so all
// writes go through this admin client from Server Actions / Route Handlers.
//
// NEVER import this into a Client Component.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Next.js App Router caches GET fetches in its Data Cache by default,
      // which froze a stale (empty) ward/task read on the control-tower & boards
      // (initial server load kept returning 0 tasks even after dispatch). All
      // reads here are live ward state, so opt every request out of the cache.
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}
