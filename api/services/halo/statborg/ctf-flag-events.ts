import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { getTeamIdsByXuid } from "@guilty-spark/shared/halo/match-stats";
import { resolveSlotIdentities } from "./slot-identity";
import { counterIncrementTimes } from "./stat-counters";
import type { CtfFlagEvent, CtfFlagEventKind, CtfFlagEvents, StatRecord, StatSlotKey } from "./types";

interface CtfStatSlot {
  key: StatSlotKey;
  kind: CtfFlagEventKind;
}

// Component slots are mode-specific. 21A/20B/21B/22A/23A/24A come from LevelUp's
// disjoint-halves control (named.go); 22B and 23B were confirmed here by exact per-player
// agreement with the API's FlagReturnersKilled and FlagSecures on match 5e3900a6.
const CTF_STAT_SLOTS: readonly CtfStatSlot[] = [
  { key: { component: 24, side: "a" }, kind: "steal" },
  { key: { component: 22, side: "a" }, kind: "grab" },
  { key: { component: 21, side: "a" }, kind: "capture" },
  { key: { component: 20, side: "b" }, kind: "captureAssist" },
  { key: { component: 23, side: "a" }, kind: "return" },
  { key: { component: 23, side: "b" }, kind: "secure" },
  { key: { component: 21, side: "b" }, kind: "carrierKilled" },
  { key: { component: 22, side: "b" }, kind: "returnerKilled" },
];

function compareEvents(left: CtfFlagEvent, right: CtfFlagEvent): number {
  return (
    left.timestampMs - right.timestampMs || left.xuid.localeCompare(right.xuid) || left.kind.localeCompare(right.kind)
  );
}

// The record grammar's slot band (10..24) covers eight concurrent players; larger lobbies
// would decode a credible-looking subset, so they are refused outright. A mid-match
// substitute reuses a slot; its counters then describe two players and identity resolution
// may attribute the slot to one of them or neither.
const MAX_SUPPORTED_PLAYERS = 8;

export function assertCtfMatchSupported(matchStats: MatchStats): void {
  if (matchStats.MatchInfo.GameVariantCategory !== GameVariantCategory.MultiplayerCtf) {
    throw new Error(`Match ${matchStats.MatchId} is not CTF; statborg components 20-24 are mode-specific`);
  }
  const startingPlayers = matchStats.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning).length;
  if (startingPlayers > MAX_SUPPORTED_PLAYERS) {
    throw new Error(
      `Statborg decode supports at most ${String(MAX_SUPPORTED_PLAYERS)} players; match ${matchStats.MatchId} started with ${String(startingPlayers)}`,
    );
  }
}

export function buildCtfFlagEventsFromRecords(records: readonly StatRecord[], matchStats: MatchStats): CtfFlagEvents {
  const identities = resolveSlotIdentities(records, matchStats);
  const teams = getTeamIdsByXuid(matchStats);
  const events: CtfFlagEvent[] = [];
  const unresolvedSlots = new Set<number>();
  for (const { key, kind } of CTF_STAT_SLOTS) {
    for (const [slot, times] of counterIncrementTimes(records, key)) {
      const xuid = identities.get(slot);
      const teamId = xuid != null ? teams.get(xuid) : undefined;
      if (xuid == null || teamId == null) {
        if (times.length > 0) {
          unresolvedSlots.add(slot);
        }
        continue;
      }
      for (const timestampMs of times) {
        events.push({ timestampMs, kind, xuid, teamId });
      }
    }
  }
  return { events: events.sort(compareEvents), unresolvedSlots: [...unresolvedSlots].sort((a, b) => a - b) };
}
