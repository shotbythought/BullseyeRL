import { headers } from "next/headers";

import { getTokenSupabaseClient } from "@/lib/supabase/token";

export async function requireBearerUser() {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }

  const accessToken = authorization.slice("Bearer ".length);
  const supabase = getTokenSupabaseClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Invalid Supabase session.");
  }

  return {
    accessToken,
    supabase,
    user,
  };
}
