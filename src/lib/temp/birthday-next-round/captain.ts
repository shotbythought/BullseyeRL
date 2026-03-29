/** REMOVE WITH: src/lib/temp/birthday-next-round/ (birthday surprise hack) */

import { getServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Captain = earliest joiner (game creator under current /api/games flow).
 * Tie-breaker: user_id for stable ordering when joined_at matches.
 */
export async function getCaptainUserIdForGame(gameId: string): Promise<string | null> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("game_players")
    .select("user_id")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true })
    .order("user_id", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (error || !data) {
    return null;
  }

  return data.user_id;
}
