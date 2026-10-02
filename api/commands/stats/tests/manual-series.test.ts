import { describe, expect, it } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../services/halo/fakes/data";
import { MANUAL_QUEUE_NUMBER_MIN, allocateManualQueueNumber, deriveManualSeriesTeams } from "../manual-series";

const ctfMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
const slayerMatchId = "9535b946-f30c-4a43-b852-000000slayer";

function aMatch(matchId: string): MatchStats {
  return Preconditions.checkExists(getMatchStats(matchId));
}

describe("allocateManualQueueNumber()", () => {
  it("returns the lowest 10-digit number when the random source returns 0", () => {
    expect(allocateManualQueueNumber(() => 0)).toBe(MANUAL_QUEUE_NUMBER_MIN);
  });

  it("returns the highest 10-digit number when the random source approaches 1", () => {
    expect(allocateManualQueueNumber(() => 0.9999999999)).toBe(9_999_999_999);
  });

  it("returns a 10-digit integer by default", () => {
    const queueNumber = allocateManualQueueNumber();

    expect(Number.isSafeInteger(queueNumber)).toBe(true);
    expect(queueNumber.toString()).toHaveLength(10);
  });
});

describe("deriveManualSeriesTeams()", () => {
  const xuidToDiscordId = new Map([
    ["0100000000000000", "discord-1"],
    ["0200000000000000", "discord-2"],
    ["0400000000000000", "discord-4"],
    ["0800000000000000", "discord-8"],
  ]);

  it("returns an empty list when no matches are given", () => {
    expect(deriveManualSeriesTeams([], xuidToDiscordId)).toEqual([]);
  });

  it("maps each Halo team of the earliest match to linked Discord users, omitting unlinked players", () => {
    const teams = deriveManualSeriesTeams([aMatch(slayerMatchId), aMatch(ctfMatchId)], xuidToDiscordId);

    expect(teams).toEqual([
      { name: "Eagle", playerIds: ["discord-1", "discord-2"] },
      { name: "Cobra", playerIds: ["discord-4", "discord-8"] },
    ]);
  });

  it("excludes players who were not present at the beginning of the earliest match", () => {
    const ctfMatch = aMatch(ctfMatchId);
    const match: MatchStats = {
      ...ctfMatch,
      Players: ctfMatch.Players.map((player) =>
        player.PlayerId === "xuid(0100000000000000)"
          ? { ...player, ParticipationInfo: { ...player.ParticipationInfo, PresentAtBeginning: false } }
          : player,
      ),
    };

    const teams = deriveManualSeriesTeams([match], xuidToDiscordId);

    expect(teams[0]).toEqual({ name: "Eagle", playerIds: ["discord-2"] });
  });
});
