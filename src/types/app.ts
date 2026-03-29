import type { PointHintDirection } from "@/lib/domain/hints";

export type ChallengeStatus = "draft" | "ready" | "failed";
export type GameStatus = "lobby" | "in_progress" | "completed";

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapCoordinate {
  lat: number;
  lng: number;
}

export type MapRing = MapCoordinate[];
export type MapPolygon = MapRing[];
export type MapArea = MapPolygon[];

export interface ImportedCoordinate {
  lat: number;
  lng: number;
  heading?: number | null;
  pitch?: number | null;
  panoId?: string | null;
  source?: Record<string, unknown>;
}

export interface ChallengeRoundRecord {
  id: string;
  challenge_id: string;
  round_index: number;
  target_lat: number;
  target_lng: number;
  street_view_lat: number;
  street_view_lng: number;
  street_view_pano_id: string | null;
  street_view_heading: number;
  street_view_pitch: number;
  street_view_fov: number;
  source_payload: Record<string, unknown> | null;
}

export interface ChallengeRecord {
  id: string;
  source_map_url: string;
  source_map_id: string;
  title: string;
  location_count: number;
  guess_limit_per_round: number;
  round_time_limit_seconds: number | null;
  radii_meters: number[];
  import_seed: string;
  status: ChallengeStatus;
  created_at: string;
  created_by: string | null;
}

export interface GameRecord {
  id: string;
  challenge_id: string;
  join_code: string;
  status: GameStatus;
  current_round_index: number;
  team_score: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GamePlayerRecord {
  id: string;
  game_id: string;
  user_id: string;
  nickname: string;
  joined_at: string;
  last_seen_at: string;
}

export interface GameRoundRecord {
  id: string;
  game_id: string;
  challenge_round_id: string;
  round_index: number;
  attempts_used: number;
  attempts_remaining: number;
  best_successful_radius_meters: number | null;
  hint_penalty_points: number;
  closer_hint_used: boolean;
  closer_hint_center_lat: number | null;
  closer_hint_center_lng: number | null;
  closer_hint_radius_meters: number | null;
  point_hint_used: boolean;
  point_hint_direction: PointHintDirection | null;
  provisional_points: number;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface GuessRecord {
  id: string;
  game_id: string;
  game_round_id: string;
  player_id: string;
  guess_lat: number;
  guess_lng: number;
  gps_accuracy_meters: number | null;
  selected_radius_meters: number;
  distance_to_target_meters: number;
  is_success: boolean;
  improved_best_result: boolean;
  created_at: string;
}

export interface LiveGuess {
  id: string;
  nickname: string;
  guessLat: number;
  guessLng: number;
  gpsAccuracyMeters: number | null;
  selectedRadiusMeters: number;
  distanceToTargetMeters: number;
  isSuccess: boolean;
  improvedBestResult: boolean;
  createdAt: string;
}

export interface CompletedGameRound {
  roundIndex: number;
  challengeRoundId: string;
  clueImageUrl: string;
  score: number;
  bestSuccessfulRadiusMeters: number | null;
}

export interface HintCircle {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface GetMeCloserHintState {
  costPoints: number;
  isAvailable: boolean;
  used: boolean;
  circle: HintCircle | null;
}

export interface PointMeHintState {
  costPoints: number;
  used: boolean;
  direction: PointHintDirection | null;
}

export interface LiveGameState {
  gameId: string;
  challengeId: string;
  challengeTitle: string;
  joinCode: string;
  status: GameStatus;
  roundIndex: number;
  roundCount: number;
  attemptsRemaining: number;
  attemptsUsed: number;
  guessLimitPerRound: number;
  roundTimeLimitSeconds: number | null;
  roundStartedAt: string;
  roundExpiresAt: string | null;
  roundTimeRemainingSeconds: number | null;
  roundTimedOut: boolean;
  radiiMeters: number[];
  bestSuccessfulRadiusMeters: number | null;
  hintPenaltyPoints: number;
  maxAvailableRoundPoints: number;
  provisionalRoundPoints: number;
  maxRoundPoints: number;
  teamScore: number;
  currentRoundId: string;
  currentChallengeRoundId: string;
  mapBounds: MapBounds;
  mapArea: MapArea;
  clueImageUrl: string;
  clueHeading: number;
  cluePitch: number;
  clueFov: number;
  guesses: LiveGuess[];
  players: Pick<GamePlayerRecord, "id" | "nickname" | "user_id" | "last_seen_at">[];
  /** First joiner (game creator). */
  viewerIsCaptain: boolean;
  hints: {
    getMeCloser: GetMeCloserHintState;
    pointMe: PointMeHintState;
  };
  roundResolved: boolean;
  completedRounds: CompletedGameRound[] | null;
  target:
    | {
        lat: number;
        lng: number;
      }
    | null;
}
