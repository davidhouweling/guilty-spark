import { describe, expect, it } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import type { APIGuildMember } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../services/halo/fakes/data";
import { aGuildMemberWith } from "../../../services/discord/fakes/data";
import {
  MANUAL_QUEUE_NUMBER_MIN,
  allocateManualQueueNumber,
  deriveManualSeriesTeams,
  findGuildMemberIdForGamertag,
  formatManualSeriesScore,
  getManualSeriesFinalMatch,
  getOutcomeForManualSeriesScore,
  parseManualSeriesGamesWon,
  toSeriesOverviewTeams,
} from "../manual-series";

const ctfMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
const slayerMatchId = "9535b946-f30c-4a43-b852-000000slayer";

function aMatch(matchId: string): MatchStats {
  return Preconditions.checkExists(getMatchStats(matchId));
}

describe("allocateManualQueueNumber()", () => {
  it("formats the UTC creation time as YYYYMMDDHHmmss", () => {
    expect(allocateManualQueueNumber(new Date("2026-10-03T05:07:09.123Z"))).toBe(20261003050709);
  });

  it("returns a safe integer above the manual queue number threshold by default", () => {
    const queueNumber = allocateManualQueueNumber();

    expect(Number.isSafeInteger(queueNumber)).toBe(true);
    expect(queueNumber).toBeGreaterThanOrEqual(MANUAL_QUEUE_NUMBER_MIN);
    expect(queueNumber.toString()).toHaveLength(14);
  });
});

describe("parseManualSeriesGamesWon()", () => {
  it.each([
    ["0", 0],
    [" 3 ", 3],
    ["99", 99],
  ])("parses %s as %d", (raw, expected) => {
    expect(parseManualSeriesGamesWon(raw)).toBe(expected);
  });

  it.each(["", "-1", "100", "1.5", "abc"])("rejects %s", (raw) => {
    expect(parseManualSeriesGamesWon(raw)).toBeUndefined();
  });
});

describe("formatManualSeriesScore()", () => {
  it("formats the score with and without team emojis", () => {
    expect(formatManualSeriesScore({ team0: 3, team1: 1 }, "en-US", true)).toBe("🦅 3:1 🐍");
    expect(formatManualSeriesScore({ team0: 3, team1: 1 }, "en-US", false)).toBe("3:1");
  });
});

describe("getOutcomeForManualSeriesScore()", () => {
  it.each([
    [{ team0: 3, team1: 1 }, "TEAM_0"],
    [{ team0: 1, team1: 3 }, "TEAM_1"],
    [{ team0: 2, team1: 2 }, "TIE"],
  ])("returns the outcome for %o", (score, expected) => {
    expect(getOutcomeForManualSeriesScore(score)).toBe(expected);
  });
});

describe("getManualSeriesFinalMatch()", () => {
  it("returns the latest started match regardless of order", () => {
    expect(getManualSeriesFinalMatch([aMatch(slayerMatchId), aMatch(ctfMatchId)])?.MatchId).toBe(slayerMatchId);
    expect(getManualSeriesFinalMatch([aMatch(ctfMatchId), aMatch(slayerMatchId)])?.MatchId).toBe(slayerMatchId);
  });

  it("returns undefined when no matches are given", () => {
    expect(getManualSeriesFinalMatch([])).toBeUndefined();
  });
});

describe("deriveManualSeriesTeams()", () => {
  const xuidToGamertag = new Map([
    ["0100000000000000", "Gamertag One"],
    ["0200000000000000", "gamertag2"],
    ["0500000000000000", "gamertag5"],
    ["0900000000000000", "gamertag9"],
    ["0400000000000000", "gamertag4"],
    ["0800000000000000", "gamertag8"],
    ["1100000000000000", "gamertag11"],
    ["1200000000000000", "gamertag12"],
  ]);
  const xuidToDiscordId = new Map([
    ["0100000000000000", "discord-1"],
    ["0400000000000000", "discord-4"],
  ]);

  it("maps every player in the final match to their team, with Discord IDs where known", () => {
    const teams = deriveManualSeriesTeams(aMatch(slayerMatchId), xuidToGamertag, xuidToDiscordId);

    expect(teams.map((team) => team.name)).toEqual(["Eagle", "Cobra"]);
    expect(teams[0]?.players).toEqual([
      { xuid: "0100000000000000", gamertag: "Gamertag One", discordId: "discord-1" },
      { xuid: "0200000000000000", gamertag: "gamertag2", discordId: null },
      { xuid: "0500000000000000", gamertag: "gamertag5", discordId: null },
      { xuid: "0900000000000000", gamertag: "gamertag9", discordId: null },
    ]);
    expect(teams[1]?.players.map((player) => player.discordId)).toEqual(["discord-4", null, null, null]);
  });

  it("excludes players who were not present at the end of the final match", () => {
    const slayerMatch = aMatch(slayerMatchId);
    const match: MatchStats = {
      ...slayerMatch,
      Players: slayerMatch.Players.map((player) =>
        player.PlayerId === "xuid(0100000000000000)"
          ? { ...player, ParticipationInfo: { ...player.ParticipationInfo, PresentAtCompletion: false } }
          : player,
      ),
    };

    const teams = deriveManualSeriesTeams(match, xuidToGamertag, xuidToDiscordId);

    expect(teams[0]?.players.map((player) => player.xuid)).not.toContain("0100000000000000");
  });

  it("falls back to the xuid when the gamertag is unknown", () => {
    const teams = deriveManualSeriesTeams(aMatch(slayerMatchId), new Map(), new Map());

    expect(teams[0]?.players[0]).toEqual({ xuid: "0100000000000000", gamertag: "0100000000000000", discordId: null });
  });
});

describe("toSeriesOverviewTeams()", () => {
  it("splits players into Discord mentions and unlinked gamertags", () => {
    expect(
      toSeriesOverviewTeams([
        {
          name: "Eagle",
          players: [
            { xuid: "1", gamertag: "linked", discordId: "discord-1" },
            { xuid: "2", gamertag: "unlinked", discordId: null },
          ],
        },
      ]),
    ).toEqual([{ name: "Eagle", playerIds: ["discord-1"], unlinkedGamertags: ["unlinked"] }]);
  });
});

describe("findGuildMemberIdForGamertag()", () => {
  function aMember(
    id: string,
    names: { username: string; globalName?: string | null; nick?: string | null },
  ): APIGuildMember {
    return aGuildMemberWith({
      nick: names.nick ?? null,
      user: { ...aGuildMemberWith().user, id, username: names.username, global_name: names.globalName ?? null },
    });
  }

  it("matches the gamertag against nickname, display name or username ignoring case and spaces", () => {
    expect(findGuildMemberIdForGamertag("Some Player", [aMember("1", { username: "someplayer" })])).toBe("1");
    expect(findGuildMemberIdForGamertag("Some Player", [aMember("2", { username: "x", nick: "SOME PLAYER" })])).toBe(
      "2",
    );
    expect(
      findGuildMemberIdForGamertag("Some Player", [aMember("3", { username: "x", globalName: "Some Player" })]),
    ).toBe("3");
  });

  it("returns undefined for prefix-only or ambiguous matches", () => {
    expect(findGuildMemberIdForGamertag("Some", [aMember("1", { username: "someplayer" })])).toBeUndefined();
    expect(
      findGuildMemberIdForGamertag("someplayer", [
        aMember("1", { username: "someplayer" }),
        aMember("2", { username: "x", nick: "SomePlayer" }),
      ]),
    ).toBeUndefined();
  });
});
