import { getServiceSupabaseClient } from "@/lib/supabase/service";

export async function maybeExpireCurrentRound(gameId: string) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.rpc("expire_current_round_if_needed", {
    p_game_id: gameId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data === true;
}
