import type { MatchScoreProgression } from "@guilty-spark/shared/contracts/stats/match-score-progression";
import { GameVariantCategory } from "halo-infinite-api";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { MatchProgressionServiceOpts } from "../match-progression";
import { MatchProgressionService } from "../match-progression";

export function aFakeMatchScoreProgressionWith(overrides: Partial<MatchScoreProgression> = {}): MatchScoreProgression {
  return {
    matchId: "test-match-id",
    mode: GameVariantCategory.MultiplayerSlayer,
    durationMs: 600_000,
    teamCount: 2,
    targetScore: null,
    timeline: {
      type: "kill-race",
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 12000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
    },
    ...overrides,
  };
}

export function aFakeMatchProgressionServiceWith(opts: Partial<MatchProgressionServiceOpts> = {}): MatchProgressionService {
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const haloFilmService = opts.haloFilmService ?? aFakeHaloFilmServiceWith();
  const logService = opts.logService ?? aFakeLogServiceWith();

  return new MatchProgressionService({ haloService, haloFilmService, logService });
}
