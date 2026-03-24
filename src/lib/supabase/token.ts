import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

export function getTokenSupabaseClient(accessToken: string) {
  const publicEnv = getPublicEnv();

  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );
}
