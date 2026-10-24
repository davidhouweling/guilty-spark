import type { MatchStats } from "halo-infinite-api";
import { differenceInMilliseconds } from "date-fns";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { RosterMember } from "./types";

// join and leave times are wall-clock stamps against the match start while lives run on the
// film clock, so presence is only asserted well inside the recorded window
export const PRESENCE_TOLERANCE_MS = 5_000;

function presentFromMs(player: MatchStats["Players"][number], startedAt: Date): number {
  if (!player.ParticipationInfo.JoinedInProgress) {
    return 0;
  }
  return Math.max(0, differenceInMilliseconds(new Date(player.ParticipationInfo.FirstJoinedTime), startedAt));
}

function presentToMs(player: MatchStats["Players"][number], startedAt: Date): number {
  const { LeftInProgress: left, LastLeaveTime: leftAt } = player.ParticipationInfo;
  if (!left || leftAt == null) {
    return Number.POSITIVE_INFINITY;
  }
  return differenceInMilliseconds(new Date(leftAt), startedAt);
}

export function buildRoster(matchStats: MatchStats): RosterMember[] {
  const startedAt = new Date(matchStats.MatchInfo.StartTime);
  return matchStats.Players.map((player) => ({
    xuid: unwrapXuid(player.PlayerId),
    teamId: player.LastTeamId,
    presentFromMs: presentFromMs(player, startedAt),
    presentToMs: presentToMs(player, startedAt),
  }));
}

// a biped is expected from a member only well inside their window
export function isPresent(member: RosterMember, atMs: number): boolean {
  return member.presentFromMs + PRESENCE_TOLERANCE_MS <= atMs && atMs <= member.presentToMs - PRESENCE_TOLERANCE_MS;
}

// a biped may belong to a member anywhere near their window
export function mayBePresent(member: RosterMember, atMs: number): boolean {
  return member.presentFromMs - PRESENCE_TOLERANCE_MS <= atMs && atMs <= member.presentToMs + PRESENCE_TOLERANCE_MS;
}

// join and leave stamps sit on the match clock like the death feed, so the offset measured
// for the deaths carries the presence windows onto the film clock too
export function alignRosterToFilm(roster: readonly RosterMember[], offsetMs: number): RosterMember[] {
  return roster.map((member) => ({
    ...member,
    presentFromMs: member.presentFromMs + offsetMs,
    presentToMs: member.presentToMs + offsetMs,
  }));
}
