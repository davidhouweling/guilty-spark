import { GameVariantCategory } from "halo-infinite-api";
import type { MatchScoreProgression } from "@guilty-spark/shared/contracts/stats/match-score-progression";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { EndUserError } from "../../base/end-user-error";
import type { HaloService } from "../halo/halo";
import type { HaloFilmService } from "../halo/halo-film";
import type { LogService } from "../log/types";

// Escalation excluded: only active-weapon kills score, but film events carry no weapon field
const KILL_RACE_GAME_MODES = new Set([
  GameVariantCategory.MultiplayerSlayer,
  GameVariantCategory.MultiplayerFiesta,
  GameVariantCategory.MultiplayerAttrition,
]);

export interface MatchProgressionServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  logService: LogService;
}

export class MatchProgressionService {
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;
  private readonly logService: LogService;

  constructor({ haloService, haloFilmService, logService }: MatchProgressionServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
    this.logService = logService;
  }

  async getMatchScoreProgression(matchId: string): Promise<MatchScoreProgression> {
    const [matchStats] = await Promise.all([
      this.haloService.getMatchDetails([matchId]).then((results) => {
        const [match] = results;
        if (match == null) {
          throw new EndUserError(`Match not found: ${matchId}`);
        }
        return match;
      }),
      this.safeWarmAuthCache(),
    ]);

    const mode = matchStats.MatchInfo.GameVariantCategory;
    if (!KILL_RACE_GAME_MODES.has(mode)) {
      throw new EndUserError(`Game mode ${GameVariantCategory[mode]} does not support kill-race score progression`);
    }

    const teamCount = new Set(matchStats.Teams.map((team) => team.TeamId)).size;
    if (teamCount === 0) {
      throw new EndUserError(`Match ${matchId} has no team data`);
    }

    const progression = await this.haloFilmService.buildSlayerProgression(matchStats);

    return {
      matchId,
      mode,
      durationMs: Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000),
      teamCount,
      targetScore: null,
      timeline: { type: "kill-race", events: progression.events },
    };
  }

  private async safeWarmAuthCache(): Promise<void> {
    try {
      await this.haloFilmService.warmAuthCache();
    } catch (error) {
      this.logService.warn(error, new Map([["context", "warmAuthCache pre-warm"]]));
    }
  }
}
