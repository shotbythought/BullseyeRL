"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export async function ensureAnonymousSession() {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    return session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.session) {
    throw error ?? new Error("Unable to create anonymous session.");
  }

  return data.session;
}

export async function getAccessToken() {
  const session = await ensureAnonymousSession();
  return session.access_token;
}
