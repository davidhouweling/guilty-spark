import { describe, expect, it } from "vitest";
import { aFakeCtfMatchStatsWith } from "../../statborg/fakes/ctf-match-stats.fake";
import { aFakeRosterMemberWith } from "../fakes/biped-position.fake";
import { alignRosterToFilm, buildRoster, isPresent, mayBePresent, PRESENCE_TOLERANCE_MS } from "../roster";

describe("buildRoster", () => {
  it("lists every player with their team and an open presence window when they played throughout", () => {
    const roster = buildRoster(aFakeCtfMatchStatsWith());

    expect(roster).toHaveLength(8);
    expect(roster[0]).toEqual({
      xuid: "0100000000000000",
      teamId: 0,
      presentFromMs: 0,
      presentToMs: Number.POSITIVE_INFINITY,
    });
    expect(roster.find((member) => member.xuid === "0400000000000000")?.teamId).toBe(1);
  });

  it("opens the window at the join time of a player who joined in progress", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    const [player] = matchStats.Players;
    if (player != null) {
      player.ParticipationInfo.JoinedInProgress = true;
      player.ParticipationInfo.FirstJoinedTime = new Date(
        new Date(matchStats.MatchInfo.StartTime).getTime() + 90_000,
      ).toISOString();
    }

    expect(buildRoster(matchStats)[0]?.presentFromMs).toBe(90_000);
  });

  it("closes the window at the leave time of a player who left in progress", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    const [player] = matchStats.Players;
    if (player != null) {
      player.ParticipationInfo.LeftInProgress = true;
      player.ParticipationInfo.LastLeaveTime = new Date(
        new Date(matchStats.MatchInfo.StartTime).getTime() + 300_000,
      ).toISOString();
    }

    expect(buildRoster(matchStats)[0]?.presentToMs).toBe(300_000);
  });

  it("keeps the window open when a leave is flagged without a leave time", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    const [player] = matchStats.Players;
    if (player != null) {
      player.ParticipationInfo.LeftInProgress = true;
      player.ParticipationInfo.LastLeaveTime = null;
    }

    expect(buildRoster(matchStats)[0]?.presentToMs).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("isPresent", () => {
  it("asserts presence only beyond the tolerance inside the window", () => {
    const member = aFakeRosterMemberWith({ presentFromMs: 10_000, presentToMs: 60_000 });

    expect(isPresent(member, 10_000 + PRESENCE_TOLERANCE_MS - 1)).toBe(false);
    expect(isPresent(member, 10_000 + PRESENCE_TOLERANCE_MS)).toBe(true);
    expect(isPresent(member, 60_000 - PRESENCE_TOLERANCE_MS)).toBe(true);
    expect(isPresent(member, 60_000 - PRESENCE_TOLERANCE_MS + 1)).toBe(false);
  });

  it("treats an open window as present for the rest of the match", () => {
    expect(isPresent(aFakeRosterMemberWith(), 10_000_000)).toBe(true);
  });
});

describe("mayBePresent", () => {
  it("allows presence anywhere within the tolerance around the window", () => {
    const member = aFakeRosterMemberWith({ presentFromMs: 10_000, presentToMs: 60_000 });

    expect(mayBePresent(member, 10_000 - PRESENCE_TOLERANCE_MS)).toBe(true);
    expect(mayBePresent(member, 10_000 - PRESENCE_TOLERANCE_MS - 1)).toBe(false);
    expect(mayBePresent(member, 60_000 + PRESENCE_TOLERANCE_MS)).toBe(true);
    expect(mayBePresent(member, 60_000 + PRESENCE_TOLERANCE_MS + 1)).toBe(false);
  });
});

describe("alignRosterToFilm", () => {
  it("shifts both ends of each presence window and keeps an open end open", () => {
    const roster = [
      aFakeRosterMemberWith({ presentFromMs: 10_000, presentToMs: 60_000 }),
      aFakeRosterMemberWith({ xuid: "0400000000000000" }),
    ];

    expect(
      alignRosterToFilm(roster, 1500).map(({ presentFromMs, presentToMs }) => [presentFromMs, presentToMs]),
    ).toEqual([
      [11_500, 61_500],
      [1500, Number.POSITIVE_INFINITY],
    ]);
  });
});
