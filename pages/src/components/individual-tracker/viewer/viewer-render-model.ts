import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import { collapseSequentialSeriesEntries } from "@guilty-spark/shared/halo/match-enrichment";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { compareAsc, parseISO } from "date-fns";
import { GameVariantCategory } from "halo-infinite-api";
import type { TrackerMatchHistoryEntry, TrackerMatchHistoryResponse } from "../../../services/individual-tracker/types";
import { createMatchStatsPresenter } from "../../stats/create";
import type { MatchStatsData } from "../../stats/types";
import { SeriesTeamStatsPresenter } from "../../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../../stats/series-player-stats-presenter";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
} from "../series-group-metadata";
import type {
  IndividualTrackerViewerAccumulatedStats,
  IndividualTrackerViewerMatchCard,
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerSeriesTotals,
  IndividualTrackerViewerTimelineItem,
  IndividualTrackerViewerTrackedPlayerTotals,
} from "../types";
import type { SeriesMetadata } from "../../stats/series-metadata";

interface SeriesGroupViewModel {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly seriesScore: string;
  readonly entries: readonly TrackerMatchHistoryEntry[];
}

type GameplayTimelineItem =
  | {
      readonly type: "group";
      readonly group: SeriesGroupViewModel;
    }
  | {
      readonly type: "match";
      readonly entry: TrackerMatchHistoryEntry;
    };

interface BuildViewerRenderModelOptions {
  readonly state: IndividualTrackerState | null;
  readonly matchHistory: TrackerMatchHistoryResponse | null;
  readonly medalMetadata: MedalMetadata;
  readonly defaultTeamColor: string;
  readonly defaultEnemyColor: string;
}

function toCompactSeriesResult(resultString: string): string {
  return resultString.replace(/^(Win|Loss|Tie|DNF|Unknown)\s*-\s*/i, "").trim();
}

function buildEntryByIdMap(entries: readonly TrackerMatchHistoryEntry[]): Map<string, TrackerMatchHistoryEntry> {
  const map = new Map<string, TrackerMatchHistoryEntry>();
  for (const entry of entries) {
    map.set(entry.matchId, entry);
  }
  return map;
}

function getEntryStartDate(entry: TrackerMatchHistoryEntry): Date {
  return parseISO(entry.startTimeIso ?? entry.startTime);
}

function buildChronologicalTrackedEntries(
  trackedMatchIds: readonly string[],
  entryById: ReadonlyMap<string, TrackerMatchHistoryEntry>,
): readonly TrackerMatchHistoryEntry[] {
  return trackedMatchIds
    .map((matchId, index) => {
      const entry = entryById.get(matchId);
      return entry == null ? null : { entry, index };
    })
    .filter((value): value is { entry: TrackerMatchHistoryEntry; index: number } => value != null)
    .sort((left, right) => {
      const leftStartDate = getEntryStartDate(left.entry);
      const rightStartDate = getEntryStartDate(right.entry);

      const dateComparison = compareAsc(leftStartDate, rightStartDate);
      if (dateComparison === 0) {
        return right.index - left.index;
      }

      return dateComparison;
    })
    .map(({ entry }) => entry);
}

function parseDisplayedTeamScore(resultString: string): { left: number; right: number } | null {
  const compactResult = toCompactSeriesResult(resultString);
  const match = /^(\d+):(\d+)/.exec(compactResult);
  if (match == null) {
    return null;
  }

  const left = parseInt(match[1], 10);
  const right = parseInt(match[2], 10);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }

  return { left, right };
}

function getTeamOrderedScore(entry: TrackerMatchHistoryEntry): { left: number; right: number } | null {
  const matchStats = entry.rawMatchStats;
  if (matchStats == null) {
    return parseDisplayedTeamScore(entry.resultString);
  }

  const [leftTeam, rightTeam] = matchStats.Teams;
  if (matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
    return {
      left: leftTeam.Stats.CoreStats.RoundsWon,
      right: rightTeam.Stats.CoreStats.RoundsWon,
    };
  }

  return {
    left: leftTeam.Stats.CoreStats.Score,
    right: rightTeam.Stats.CoreStats.Score,
  };
}

function normalizeTeamPlayers(players: readonly string[]): readonly string[] {
  return [...players].map((player) => player.trim().toLowerCase()).sort((left, right) => left.localeCompare(right));
}

function getCanonicalTeamIndex(
  entryTeam: readonly string[],
  canonicalTeams: readonly (readonly string[])[],
): number | null {
  const normalizedEntryTeam = normalizeTeamPlayers(entryTeam);
  let bestIndex: number | null = null;
  let bestOverlap = 0;

  for (const [teamIndex, canonicalTeam] of canonicalTeams.entries()) {
    const normalizedCanonicalTeam = normalizeTeamPlayers(canonicalTeam);
    if (normalizedEntryTeam.length === normalizedCanonicalTeam.length) {
      const isExactMatch = normalizedEntryTeam.every(
        (player, playerIndex) => player === normalizedCanonicalTeam[playerIndex],
      );
      if (isExactMatch) {
        return teamIndex;
      }
    }

    const canonicalPlayerSet = new Set(normalizedCanonicalTeam);
    let overlap = 0;
    for (const player of normalizedEntryTeam) {
      if (canonicalPlayerSet.has(player)) {
        overlap += 1;
      }
    }

    if (overlap > bestOverlap) {
      bestIndex = teamIndex;
      bestOverlap = overlap;
    }
  }

  return bestOverlap > 0 ? bestIndex : null;
}

function getWinningTeamIndex(
  entry: TrackerMatchHistoryEntry,
  canonicalTeams: readonly (readonly string[])[],
): number | null {
  const parsedScore = getTeamOrderedScore(entry);
  if (parsedScore == null || parsedScore.left === parsedScore.right) {
    return null;
  }

  const localWinningTeamIndex = parsedScore.left > parsedScore.right ? 0 : 1;
  const winningTeam = entry.teams[localWinningTeamIndex];

  return getCanonicalTeamIndex(winningTeam, canonicalTeams);
}

function computeSeriesScore(entries: readonly TrackerMatchHistoryEntry[]): string {
  const logicalEntries = collapseSequentialSeriesEntries(
    entries.map((entry) => ({
      ...entry,
      startTime: entry.startTimeIso ?? entry.startTime,
    })),
  );
  const canonicalTeams = entries[0]?.teams.slice(0, 2) ?? [];
  let firstTeamWins = 0;
  let secondTeamWins = 0;

  for (const entry of logicalEntries) {
    const winningTeamIndex = getWinningTeamIndex(entry, canonicalTeams);
    if (winningTeamIndex === 0) {
      firstTeamWins += 1;
    }

    if (winningTeamIndex === 1) {
      secondTeamWins += 1;
    }
  }

  return `${firstTeamWins.toString()}:${secondTeamWins.toString()}`;
}

function buildSeriesGroups(
  trackedMatchIds: readonly string[],
  stateSeriesGroups: IndividualTrackerState["seriesGroups"],
  stateMatchGroupings: readonly (readonly string[])[],
  matchHistory: TrackerMatchHistoryResponse | null,
): { groups: readonly SeriesGroupViewModel[]; groupedMatchIds: Set<string> } {
  if (matchHistory == null) {
    return { groups: [], groupedMatchIds: new Set<string>() };
  }

  const groupingSource = stateMatchGroupings.length > 0 ? stateMatchGroupings : matchHistory.suggestedGroupings;
  const trackedIdSet = new Set(trackedMatchIds);
  const groupedMatchIds = new Set<string>();
  const entryById = buildEntryByIdMap(matchHistory.matches);
  const stateSeriesGroupsByKey = new Map(
    stateSeriesGroups.map((group) => [buildSeriesGroupKey(group.matchIds), group]),
  );
  const groups: SeriesGroupViewModel[] = [];

  for (const suggestedGroup of groupingSource) {
    const filteredIds = suggestedGroup.filter((matchId) => trackedIdSet.has(matchId));
    if (filteredIds.length < 2) {
      continue;
    }

    const entries = trackedMatchIds
      .filter((matchId) => filteredIds.includes(matchId))
      .map((matchId) => entryById.get(matchId))
      .filter((entry): entry is TrackerMatchHistoryEntry => entry != null);

    if (entries.length < 2) {
      continue;
    }

    for (const matchId of filteredIds) {
      groupedMatchIds.add(matchId);
    }

    const groupKey = buildSeriesGroupKey(filteredIds);
    const stateSeriesGroup = stateSeriesGroupsByKey.get(groupKey);
    groups.push({
      id: `series:${groupKey}`,
      title: stateSeriesGroup?.titleOverride ?? getDefaultSeriesGroupTitle(),
      subtitle: stateSeriesGroup?.subtitleOverride ?? getDefaultSeriesGroupSubtitle(entries),
      seriesScore: computeSeriesScore(entries),
      entries,
    });
  }

  return { groups, groupedMatchIds };
}

function buildGameplayTimeline(
  trackedEntries: readonly TrackerMatchHistoryEntry[],
  seriesGroups: readonly SeriesGroupViewModel[],
): readonly GameplayTimelineItem[] {
  const groupedMatchIds = new Set<string>();
  const firstMatchIdToGroup = new Map<string, SeriesGroupViewModel>();

  for (const group of seriesGroups) {
    const [firstEntry] = group.entries;
    firstMatchIdToGroup.set(firstEntry.matchId, group);

    for (const entry of group.entries) {
      groupedMatchIds.add(entry.matchId);
    }
  }

  const items: GameplayTimelineItem[] = [];

  for (const entry of trackedEntries) {
    const group = firstMatchIdToGroup.get(entry.matchId);
    if (group != null) {
      items.push({ type: "group", group });
      continue;
    }

    if (groupedMatchIds.has(entry.matchId)) {
      continue;
    }

    items.push({ type: "match", entry });
  }

  return items;
}

function computeSeriesMetadata(
  entries: readonly TrackerMatchHistoryEntry[],
  seriesScore: string,
): SeriesMetadata | null {
  if (entries.length === 0) {
    return null;
  }

  const [first] = entries;
  const last = entries[entries.length - 1];
  const firstTime = first.startTimeIso ?? first.startTime;
  const lastTime = last.endTimeIso ?? last.endTime;
  const startMs = new Date(firstTime).getTime();
  const endMs = new Date(lastTime).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }

  const totalMs = endMs - startMs;
  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);

  return {
    score: seriesScore,
    duration: `${totalMinutes.toLocaleString()}m ${totalSeconds.toLocaleString()}s`,
    startTime: firstTime,
    endTime: lastTime,
  };
}

function buildAllMatchStats(
  trackedEntries: readonly TrackerMatchHistoryEntry[],
  medalMetadata: MedalMetadata,
): Map<string, MatchStatsData[] | null> {
  const statsByMatchId = new Map<string, MatchStatsData[] | null>();

  for (const entry of trackedEntries) {
    if (entry.rawMatchStats == null) {
      statsByMatchId.set(entry.matchId, null);
      continue;
    }

    try {
      const matchStatsPresenter = createMatchStatsPresenter(entry.rawMatchStats.MatchInfo.GameVariantCategory);
      const playerMap = new Map(Object.entries(entry.playerXuidToGametag ?? {}));
      statsByMatchId.set(entry.matchId, matchStatsPresenter.getData(entry.rawMatchStats, playerMap, medalMetadata));
    } catch {
      statsByMatchId.set(entry.matchId, null);
    }
  }

  return statsByMatchId;
}

function buildSeriesStatsByGroup(
  seriesGroups: readonly SeriesGroupViewModel[],
  medalMetadata: MedalMetadata,
): Map<string, IndividualTrackerViewerSeriesTotals> {
  const groupStats = new Map<string, IndividualTrackerViewerSeriesTotals>();

  const teamPresenter = new SeriesTeamStatsPresenter();
  const playerPresenter = new SeriesPlayerStatsPresenter();

  for (const group of seriesGroups) {
    const rawMatchStats = group.entries
      .map((entry) => entry.rawMatchStats)
      .filter((matchStats): matchStats is NonNullable<typeof matchStats> => matchStats != null);

    if (rawMatchStats.length === 0) {
      continue;
    }

    const allPlayerXuidToGametag = new Map<string, string>();
    for (const entry of group.entries) {
      for (const [xuid, gamertag] of Object.entries(entry.playerXuidToGametag ?? {})) {
        allPlayerXuidToGametag.set(xuid, gamertag);
      }
    }

    groupStats.set(group.id, {
      teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, medalMetadata),
      playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, medalMetadata),
      metadata: computeSeriesMetadata(group.entries, group.seriesScore),
    });
  }

  return groupStats;
}

function buildTrackedPlayerTotals(
  state: IndividualTrackerState,
  trackedEntries: readonly TrackerMatchHistoryEntry[],
  overallScore: string,
  medalMetadata: MedalMetadata,
): IndividualTrackerViewerTrackedPlayerTotals | null {
  const rawMatchStats = trackedEntries
    .map((entry) => entry.rawMatchStats)
    .filter((matchStats): matchStats is NonNullable<typeof matchStats> => matchStats != null);

  if (rawMatchStats.length === 0) {
    return null;
  }

  const allPlayerXuidToGametag = new Map<string, string>();
  for (const entry of trackedEntries) {
    for (const [xuid, gamertag] of Object.entries(entry.playerXuidToGametag ?? {})) {
      allPlayerXuidToGametag.set(xuid, gamertag);
    }
  }

  const playerPresenter = new SeriesPlayerStatsPresenter();
  const allPlayerData = playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, medalMetadata);
  const trackedGamertag = state.gamertag.trim().toLowerCase();

  const filteredPlayerData = allPlayerData
    .map((team) => ({
      ...team,
      players: team.players.filter((player) => {
        const rawName = player.name.split(" (")[0] ?? player.name;
        return rawName.trim().toLowerCase() === trackedGamertag;
      }),
    }))
    .filter((team) => team.players.length > 0);

  if (filteredPlayerData.length === 0) {
    return null;
  }

  return {
    teamData: [],
    playerData: filteredPlayerData,
    metadata: computeSeriesMetadata(trackedEntries, overallScore),
    title: `${state.gamertag} Totals`,
  };
}

function buildAccumulatedStats(
  trackedEntries: readonly TrackerMatchHistoryEntry[],
  seriesGroupCount: number,
  standaloneCount: number,
): IndividualTrackerViewerAccumulatedStats {
  const totals = {
    total: trackedEntries.length,
    wins: 0,
    losses: 0,
    ties: 0,
    customOrLocal: 0,
    matchmaking: 0,
    groupedSeries: seriesGroupCount,
    standalone: standaloneCount,
  };

  for (const entry of trackedEntries) {
    if (entry.outcome === "Win") {
      totals.wins += 1;
    }
    if (entry.outcome === "Loss") {
      totals.losses += 1;
    }
    if (entry.outcome === "Tie") {
      totals.ties += 1;
    }

    if (entry.isMatchmaking) {
      totals.matchmaking += 1;
    } else {
      totals.customOrLocal += 1;
    }
  }

  return totals satisfies IndividualTrackerViewerAccumulatedStats;
}

function buildMatchCard(
  entry: TrackerMatchHistoryEntry,
  matchStats: MatchStatsData[] | null,
  matchNumber: number,
): IndividualTrackerViewerMatchCard {
  return {
    id: entry.matchId,
    matchStats,
    backgroundImageUrl: entry.mapThumbnailUrl,
    gameMode: entry.modeName,
    matchNumber,
    gameTypeAndMap: entry.gameTypeAndMap ?? `${entry.modeName}: ${entry.mapName}`,
    duration: entry.duration,
    score: entry.resultString,
    startTime: entry.startTimeIso ?? entry.startTime,
    endTime: entry.endTimeIso ?? entry.endTime,
  };
}

export function buildIndividualTrackerViewerRenderModel({
  state,
  matchHistory,
  medalMetadata,
  defaultTeamColor,
  defaultEnemyColor,
}: BuildViewerRenderModelOptions): IndividualTrackerViewerRenderModel | null {
  if (state == null) {
    return null;
  }

  const entryById = buildEntryByIdMap(matchHistory?.matches ?? []);
  const trackedEntries = buildChronologicalTrackedEntries(state.matchIds, entryById);
  const chronologicalTrackedMatchIds = trackedEntries.map((entry) => entry.matchId);

  const { groups: seriesGroups, groupedMatchIds } = buildSeriesGroups(
    chronologicalTrackedMatchIds,
    state.seriesGroups,
    state.matchGroupings,
    matchHistory,
  );
  const standaloneMatches = trackedEntries.filter((entry) => !groupedMatchIds.has(entry.matchId));
  const accumulatedStats = buildAccumulatedStats(trackedEntries, seriesGroups.length, standaloneMatches.length);
  const overallScore = `${accumulatedStats.wins.toString()}:${accumulatedStats.losses.toString()}`;
  const teamColors = [
    getTeamColorOrDefault(state.teamColor ?? defaultTeamColor, 0),
    getTeamColorOrDefault(state.enemyColor ?? defaultEnemyColor, 1),
  ] as const;

  const allMatchStats = buildAllMatchStats(trackedEntries, medalMetadata);
  const seriesStatsByGroup = buildSeriesStatsByGroup(seriesGroups, medalMetadata);
  const trackedPlayerTotals = buildTrackedPlayerTotals(state, trackedEntries, overallScore, medalMetadata);
  const gameplayTimeline = buildGameplayTimeline(trackedEntries, seriesGroups);

  const timelineItems: IndividualTrackerViewerTimelineItem[] = gameplayTimeline.map((item, timelineIndex) => {
    if (item.type === "group") {
      const { group } = item;
      const [firstMatch] = group.entries;
      const seriesTotals = seriesStatsByGroup.get(group.id) ?? null;
      const canonicalTeams = firstMatch.teams.slice(0, 2);

      return {
        type: "group",
        id: group.id,
        title: group.title,
        subtitle: group.subtitle,
        seriesScore: group.seriesScore,
        overviewMatches: group.entries.map((entry) => ({
          id: entry.matchId,
          gameMode: entry.modeName,
          score: toCompactSeriesResult(entry.resultString),
          mapName: entry.mapName,
          mapThumbnailUrl: entry.mapThumbnailUrl,
          winningTeamIndex: getWinningTeamIndex(entry, canonicalTeams) ?? undefined,
        })),
        teams: firstMatch.teams.slice(0, 2).map((team, teamIndex) => ({
          id: `${group.id}-team-${teamIndex.toString()}`,
          name: `Team ${(teamIndex + 1).toLocaleString()}`,
          colorHex: teamColors[teamIndex]?.hex,
          players: team.map((player) => ({
            id: `${group.id}-team-${teamIndex.toString()}-${player}`,
            content: player,
          })),
        })),
        seriesTotals,
        matches: group.entries.map((entry, entryIndex) =>
          buildMatchCard(entry, allMatchStats.get(entry.matchId) ?? null, entryIndex + 1),
        ),
      };
    }

    return {
      type: "match",
      id: item.entry.matchId,
      match: buildMatchCard(item.entry, allMatchStats.get(item.entry.matchId) ?? null, timelineIndex + 1),
    };
  });

  return {
    lastUpdatedTime: state.lastUpdateTime,
    trackerStatus: state.status,
    accumulatedStats,
    teamColors,
    trackedPlayerTotals,
    gameplayTimeline: timelineItems,
    trackedEntriesCount: trackedEntries.length,
  };
}
