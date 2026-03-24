import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

export function getServiceSupabaseClient() {
  const serverEnv = getServerEnv();

  return createClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
