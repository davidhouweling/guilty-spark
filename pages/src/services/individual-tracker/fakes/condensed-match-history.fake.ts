import type { CondensedMatchHistoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { prepareCondensedMatchHistory } from "../prepare-condensed-match-history";
import type {
  CondensedMatchHistoryRequest,
  CondensedMatchHistoryService,
  PreparedMatchHistoryPage,
} from "../condensed-match-history-types";

export function aFakeCondensedMatchHistoryEntryWith(
  overrides: Partial<CondensedMatchHistoryEntry> = {},
): CondensedMatchHistoryEntry {
  return {
    matchId: "history-match-1",
    startTimeIso: "2026-01-02T01:00:00.000Z",
    endTimeIso: "2026-01-02T01:10:00.000Z",
    durationIso: "PT10M",
    mapAssetId: "map-asset-1",
    mapVersionId: "map-version-1",
    modeAssetId: "mode-asset-1",
    modeVersionId: "mode-version-1",
    gameVariantCategory: 6,
    mapName: "Live Fire",
    modeName: "Slayer",
    mapThumbnailUrl: "data:,",
    outcome: "Win",
    isMatchmaking: false,
    matchmakingPlaylist: null,
    category: "custom",
    teams: [["Player One"], ["Player Two"]],
    teamRosterSignature: "roster-1",
    teamCount: 2,
    score: { scores: [50, 42], roundsWon: null },
    trackedPlayerSummary: { kills: 10, deaths: 7, assists: 4, damageDealt: 4200, damageTaken: 3900 },
    highlightContribution: {
      kills: 10,
      deaths: 7,
      assists: 4,
      damageDealt: 4200,
      damageTaken: 3900,
      headshotKills: 5,
      shotsFired: 100,
      shotsHit: 50,
      totalLifeSeconds: 240,
      totalSpawns: 8,
      totalLifeSpawns: 8,
    },
    ...overrides,
  };
}

interface FakeCondensedMatchHistoryServiceOptions {
  readonly matches?: readonly CondensedMatchHistoryEntry[] | undefined;
  readonly suggestedGroupings?: readonly (readonly string[])[] | undefined;
}

export class FakeCondensedMatchHistoryService implements CondensedMatchHistoryService {
  private readonly matches: readonly CondensedMatchHistoryEntry[];

  constructor(private readonly options: FakeCondensedMatchHistoryServiceOptions = {}) {
    this.matches = options.matches ?? [aFakeCondensedMatchHistoryEntryWith()];
  }

  async getMatchHistory(request: CondensedMatchHistoryRequest): Promise<PreparedMatchHistoryPage> {
    const matches = this.matches
      .filter((match) => request.category !== "custom" || match.category === "custom")
      .slice(request.start, request.start + request.count);
    const ids = new Set(matches.map((match) => match.matchId));
    const suggestedGroupings = (this.options.suggestedGroupings ?? [])
      .map((group) => group.filter((id) => ids.has(id)))
      .filter((group) => group.length > 1);
    return await Promise.resolve(prepareCondensedMatchHistory({ matches, suggestedGroupings }));
  }
}

export function aFakeCondensedMatchHistoryServiceWith(
  options: FakeCondensedMatchHistoryServiceOptions = {},
): FakeCondensedMatchHistoryService {
  return new FakeCondensedMatchHistoryService(options);
}
