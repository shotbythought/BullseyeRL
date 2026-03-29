import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  GET_ME_CLOSER_HINT_COST,
  POINT_ME_HINT_COST,
  getGetMeCloserHintRadius,
} from "@/lib/domain/hints";
import {
  getLocationPresetBounds,
  getLocationRegionBounds,
} from "@/lib/location-presets";
import { applyHintPenalty, maxPointsForRadii } from "@/lib/domain/scoring";
import { maybeExpireCurrentRound } from "@/lib/data/round-timeouts";
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

  await maybeExpireCurrentRound(gameId);

  const [{ data: players, error: playersError }, { data: game, error: gameError }] =
    await Promise.all([
      supabase
        .from("game_players")
        .select("id, user_id, nickname, last_seen_at, joined_at")
        .eq("game_id", gameId)
        .order("joined_at", { ascending: true })
        .order("user_id", { ascending: true })
        .returns<
          Pick<
            GamePlayerRecord,
            "id" | "user_id" | "nickname" | "last_seen_at" | "joined_at"
          >[]
        >(),
      supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single<GameRecord>(),
    ]);

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (!(players ?? []).some((player) => player.user_id === viewerUserId)) {
    throw new Error("You are not a member of this game.");
  }

  if (gameError || !game) {
    throw new Error("Game not found.");
  }

  const [
    { data: challenge, error: challengeError },
    { data: currentGameRound, error: roundError },
  ] = await Promise.all([
    supabase
      .from("challenges")
      .select("*")
      .eq("id", game.challenge_id)
      .single<ChallengeRecord>(),
    supabase
      .from("game_rounds")
      .select("*")
      .eq("game_id", game.id)
      .eq("round_index", game.current_round_index)
      .single<GameRoundRecord>(),
  ]);

  if (challengeError || !challenge) {
    throw new Error("Challenge not found.");
  }

  if (roundError || !currentGameRound) {
    throw new Error("Current round not found.");
  }

  const [
    { data: challengeRound, error: challengeRoundError },
    { data: guesses, error: guessesError },
  ] = await Promise.all([
    supabase
      .from("challenge_rounds")
      .select("*")
      .eq("id", currentGameRound.challenge_round_id)
      .single<ChallengeRoundRecord>(),
    supabase
      .from("guesses")
      .select("*")
      .eq("game_round_id", currentGameRound.id)
      .order("created_at", { ascending: true })
      .returns<GuessRecord[]>(),
  ]);

  if (challengeRoundError || !challengeRound) {
    throw new Error("Challenge round not found.");
  }

  if (guessesError) {
    throw new Error(guessesError.message);
  }

  const playerNames = new Map((players ?? []).map((player) => [player.id, player.nickname]));
  const mapBounds = resolveMapBounds(challenge, challengeRound);
  const maxRoundPoints = maxPointsForRadii(challenge.radii_meters);
  const closerHintRadius = getGetMeCloserHintRadius(challenge.radii_meters);
  const completedRounds =
    game.status === "completed"
      ? await getCompletedRounds({
          challengeId: challenge.id,
          gameId: game.id,
        })
      : null;
  const roundExpiresAtMs =
    challenge.round_time_limit_seconds == null
      ? null
      : new Date(currentGameRound.created_at).getTime() +
        challenge.round_time_limit_seconds * 1000;
  const roundTimedOut =
    currentGameRound.resolved &&
    currentGameRound.attempts_remaining > 0 &&
    roundExpiresAtMs != null &&
    roundExpiresAtMs <= Date.now();
  const viewerIsCaptain = (players ?? [])[0]?.user_id === viewerUserId;

  return {
    gameId: game.id,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    joinCode: game.join_code,
    status: game.status,
    roundIndex: currentGameRound.round_index,
    roundCount: challenge.location_count,
    attemptsRemaining: currentGameRound.attempts_remaining,
    attemptsUsed: currentGameRound.attempts_used,
    guessLimitPerRound: challenge.guess_limit_per_round,
    roundTimeLimitSeconds: challenge.round_time_limit_seconds,
    roundStartedAt: currentGameRound.created_at,
    roundExpiresAt: roundExpiresAtMs == null ? null : new Date(roundExpiresAtMs).toISOString(),
    roundTimeRemainingSeconds:
      roundExpiresAtMs == null
        ? null
        : currentGameRound.resolved
          ? 0
          : Math.max(0, Math.ceil((roundExpiresAtMs - Date.now()) / 1000)),
    roundTimedOut,
    radiiMeters: challenge.radii_meters,
    bestSuccessfulRadiusMeters: currentGameRound.best_successful_radius_meters,
    hintPenaltyPoints: currentGameRound.hint_penalty_points,
    maxAvailableRoundPoints: applyHintPenalty(
      maxRoundPoints,
      currentGameRound.hint_penalty_points,
    ),
    provisionalRoundPoints: currentGameRound.provisional_points,
    maxRoundPoints,
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
    players: (players ?? []).map((player) => ({
      id: player.id,
      user_id: player.user_id,
      nickname: player.nickname,
      last_seen_at: player.last_seen_at,
    })),
    viewerIsCaptain,
    hints: {
      getMeCloser: {
        costPoints: GET_ME_CLOSER_HINT_COST,
        isAvailable: closerHintRadius != null,
        used: currentGameRound.closer_hint_used,
        circle:
          currentGameRound.closer_hint_used &&
          currentGameRound.closer_hint_center_lat != null &&
          currentGameRound.closer_hint_center_lng != null &&
          currentGameRound.closer_hint_radius_meters != null
            ? {
                lat: currentGameRound.closer_hint_center_lat,
                lng: currentGameRound.closer_hint_center_lng,
                radiusMeters: currentGameRound.closer_hint_radius_meters,
              }
            : null,
      },
      pointMe: {
        costPoints: POINT_ME_HINT_COST,
        used: currentGameRound.point_hint_used,
        direction: currentGameRound.point_hint_direction,
      },
    },
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
