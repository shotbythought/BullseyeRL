import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  getLocationPresetBounds,
  getLocationRegionBounds,
} from "@/lib/location-presets";
import { SCORE_STEP } from "@/lib/domain/scoring";
import type {
  ChallengeRecord,
  ChallengeRoundRecord,
  CompletedGameRound,
  GamePlayerRecord,
  GameRecord,
  GameRoundRecord,
  GuessRecord,
  LiveGameState,
  MapBounds,
} from "@/types/app";

export async function getChallengeWithRounds(challengeId: string) {
  const supabase = getServiceSupabaseClient();
  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single<ChallengeRecord>();

  if (challengeError || !challenge) {
    throw new Error("Challenge not found.");
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("challenge_rounds")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("round_index", { ascending: true })
    .returns<ChallengeRoundRecord[]>();

  if (roundsError) {
    throw new Error(roundsError.message);
  }

  return {
    challenge,
    rounds: rounds ?? [],
  };
}

export async function getLiveGameState(gameId: string, viewerUserId: string): Promise<LiveGameState> {
  const supabase = getServiceSupabaseClient();

  const { data: membership, error: membershipError } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("user_id", viewerUserId)
    .maybeSingle<{ id: string }>();

  if (membershipError || !membership) {
    throw new Error("You are not a member of this game.");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single<GameRecord>();

  if (gameError || !game) {
    throw new Error("Game not found.");
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", game.challenge_id)
    .single<ChallengeRecord>();

  if (challengeError || !challenge) {
    throw new Error("Challenge not found.");
  }

  const { data: currentGameRound, error: roundError } = await supabase
    .from("game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("round_index", game.current_round_index)
    .single<GameRoundRecord>();

  if (roundError || !currentGameRound) {
    throw new Error("Current round not found.");
  }

  const { data: challengeRound, error: challengeRoundError } = await supabase
    .from("challenge_rounds")
    .select("*")
    .eq("id", currentGameRound.challenge_round_id)
    .single<ChallengeRoundRecord>();

  if (challengeRoundError || !challengeRound) {
    throw new Error("Challenge round not found.");
  }

  const [{ data: guesses, error: guessesError }, { data: players, error: playersError }, { count: roundCount, error: countError }] =
    await Promise.all([
      supabase
        .from("guesses")
        .select("*")
        .eq("game_round_id", currentGameRound.id)
        .order("created_at", { ascending: true })
        .returns<GuessRecord[]>(),
      supabase
        .from("game_players")
        .select("id, user_id, nickname, last_seen_at")
        .eq("game_id", game.id)
        .order("joined_at", { ascending: true })
        .returns<Pick<GamePlayerRecord, "id" | "user_id" | "nickname" | "last_seen_at">[]>(),
      supabase
        .from("challenge_rounds")
        .select("id", { count: "exact", head: true })
        .eq("challenge_id", challenge.id),
    ]);

  if (guessesError) {
    throw new Error(guessesError.message);
  }

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (countError) {
    throw new Error(countError.message);
  }

  const playerNames = new Map((players ?? []).map((player) => [player.id, player.nickname]));
  const mapBounds = resolveMapBounds(challenge, challengeRound);
  const completedRounds =
    game.status === "completed"
      ? await getCompletedRounds({
          challengeId: challenge.id,
          gameId: game.id,
        })
      : null;

  return {
    gameId: game.id,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    joinCode: game.join_code,
    status: game.status,
    roundIndex: currentGameRound.round_index,
    roundCount: roundCount ?? challenge.location_count,
    attemptsRemaining: currentGameRound.attempts_remaining,
    attemptsUsed: currentGameRound.attempts_used,
    guessLimitPerRound: challenge.guess_limit_per_round,
    radiiMeters: challenge.radii_meters,
    bestSuccessfulRadiusMeters: currentGameRound.best_successful_radius_meters,
    provisionalRoundPoints: currentGameRound.provisional_points,
    maxRoundPoints: challenge.radii_meters.length * SCORE_STEP,
    teamScore: game.team_score,
    currentRoundId: currentGameRound.id,
    currentChallengeRoundId: challengeRound.id,
    mapBounds,
    clueImageUrl: `/api/clue/${challengeRound.id}`,
    clueHeading: challengeRound.street_view_heading,
    cluePitch: challengeRound.street_view_pitch,
    clueFov: challengeRound.street_view_fov,
    guesses: (guesses ?? []).map((guess) => ({
      id: guess.id,
      nickname: playerNames.get(guess.player_id) ?? "Teammate",
      guessLat: guess.guess_lat,
      guessLng: guess.guess_lng,
      gpsAccuracyMeters: guess.gps_accuracy_meters,
      selectedRadiusMeters: guess.selected_radius_meters,
      distanceToTargetMeters: guess.distance_to_target_meters,
      isSuccess: guess.is_success,
      improvedBestResult: guess.improved_best_result,
      createdAt: guess.created_at,
    })),
    players: players ?? [],
    roundResolved: currentGameRound.resolved,
    completedRounds,
    target: currentGameRound.resolved
      ? {
          lat: challengeRound.target_lat,
          lng: challengeRound.target_lng,
        }
      : null,
  };
}

function resolveMapBounds(
  challenge: ChallengeRecord,
  challengeRound: ChallengeRoundRecord,
): MapBounds {
  const regionId = getSourcePayloadString(challengeRound.source_payload, "regionId");
  const regionBounds = regionId ? getLocationRegionBounds(regionId) : null;

  if (regionBounds) {
    return regionBounds;
  }

  const presetId =
    getSourcePayloadString(challengeRound.source_payload, "presetId") ?? challenge.source_map_id;
  const presetBounds = getLocationPresetBounds(presetId);

  if (presetBounds) {
    return presetBounds;
  }

  throw new Error("Map bounds are unavailable for this round.");
}

async function getCompletedRounds(input: {
  challengeId: string;
  gameId: string;
}): Promise<CompletedGameRound[]> {
  const supabase = getServiceSupabaseClient();
  const [{ data: gameRounds, error: gameRoundsError }, { data: challengeRounds, error: challengeRoundsError }] =
    await Promise.all([
      supabase
        .from("game_rounds")
        .select("round_index, challenge_round_id, provisional_points, best_successful_radius_meters")
        .eq("game_id", input.gameId)
        .order("round_index", { ascending: true })
        .returns<
          Pick<
            GameRoundRecord,
            "round_index" | "challenge_round_id" | "provisional_points" | "best_successful_radius_meters"
          >[]
        >(),
      supabase
        .from("challenge_rounds")
        .select("id")
        .eq("challenge_id", input.challengeId)
        .order("round_index", { ascending: true })
        .returns<Pick<ChallengeRoundRecord, "id">[]>(),
    ]);

  if (gameRoundsError) {
    throw new Error(gameRoundsError.message);
  }

  if (challengeRoundsError) {
    throw new Error(challengeRoundsError.message);
  }

  const challengeRoundIds = new Set((challengeRounds ?? []).map((round) => round.id));

  return (gameRounds ?? []).map((round) => {
    if (!challengeRoundIds.has(round.challenge_round_id)) {
      throw new Error("Completed round is missing challenge metadata.");
    }

    return {
      roundIndex: round.round_index,
      challengeRoundId: round.challenge_round_id,
      clueImageUrl: `/api/clue/${round.challenge_round_id}`,
      score: round.provisional_points,
      bestSuccessfulRadiusMeters: round.best_successful_radius_meters,
    };
  });
}

function getSourcePayloadString(
  sourcePayload: ChallengeRoundRecord["source_payload"],
  key: string,
) {
  if (!sourcePayload || typeof sourcePayload[key] !== "string") {
    return null;
  }

  return sourcePayload[key] as string;
}
