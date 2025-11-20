import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectHistoryEmbed } from "../connect-history-embed.mjs";
import { EmbedColors } from "../../colors.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import { aFakePlayerMatchHistoryWith } from "../../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

const connectHistoryMatches = [aFakePlayerMatchHistoryWith(), aFakePlayerMatchHistoryWith()];

describe("ConnectHistoryEmbed", () => {
  let discordService: ReturnType<typeof aFakeDiscordServiceWith>;
  let haloService: ReturnType<typeof aFakeHaloServiceWith>;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
  });

  it("creates embed with match history", async () => {
    const match = Preconditions.checkExists(connectHistoryMatches[0]);
    const getRecentMatchHistorySpy = vi.spyOn(haloService, "getRecentMatchHistory").mockResolvedValue([match]);
    vi.spyOn(haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Live Fire");
    vi.spyOn(haloService, "getMatchOutcome").mockReturnValue("Win");
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([
      {
        MatchId: "match-001-slayer",
        Teams: [
          { TeamId: 0, Stats: { Score: 50 } },
          { TeamId: 1, Stats: { Score: 30 } },
        ],
      } as never,
    ]);
    vi.spyOn(haloService, "getMatchScore").mockReturnValue("50 - 30");
    vi.spyOn(discordService, "getTimestamp").mockReturnValue("<t:1732615200:R>");

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(getRecentMatchHistorySpy).toHaveBeenCalledWith("TestPlayer", 2);
    expect(result.title).toBe('Recent custom game matches for "TestPlayer"');
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.name).toBe("Game");
    expect(result.fields?.[0]?.value).toBe("Slayer on Live Fire");
    expect(result.fields?.[1]?.name).toBe("Result");
    expect(result.fields?.[1]?.value).toBe("Win - 50 - 30");
    expect(result.fields?.[2]?.name).toBe("When");
    expect(result.fields?.[2]?.value).toBe("<t:1732615200:R>");
  });

  it("uses custom title and description when provided", async () => {
    vi.spyOn(haloService, "getRecentMatchHistory").mockResolvedValue([]);

    const embed = new ConnectHistoryEmbed(
      { discordService, haloService },
      {
        gamertag: "TestPlayer",
        locale: "en-US",
        title: "Custom Title",
        description: "Custom Description",
      },
    );

    const result = await embed.getEmbed();

    expect(result.title).toBe("Custom Title");
    expect(result.description).toBe("Custom Description");
  });

  it("shows help message when no matches found", async () => {
    vi.spyOn(haloService, "getRecentMatchHistory").mockResolvedValue([]);

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(result.fields).toHaveLength(1);
    expect(result.fields?.[0]?.name).toBe("No custom game matches found");
    expect(result.fields?.[0]?.value).toContain("To resolve, either:");
    expect(result.fields?.[0]?.value).toContain("Halo Waypoint Privacy settings");
  });

  it("handles multiple matches", async () => {
    const match1 = Preconditions.checkExists(connectHistoryMatches[0]);
    const match2 = Preconditions.checkExists(connectHistoryMatches[1]);

    vi.spyOn(haloService, "getRecentMatchHistory").mockResolvedValue([match1, match2]);
    vi.spyOn(haloService, "getGameTypeAndMap")
      .mockResolvedValueOnce("Slayer on Live Fire")
      .mockResolvedValueOnce("CTF on Recharge");
    vi.spyOn(haloService, "getMatchOutcome").mockReturnValueOnce("Win").mockReturnValueOnce("Loss");
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([
      { MatchId: "match-001-slayer", Teams: [{ TeamId: 0, Stats: { Score: 50 } }] } as never,
      { MatchId: "match-002-ctf", Teams: [{ TeamId: 1, Stats: { Score: 2 } }] } as never,
    ]);
    vi.spyOn(haloService, "getMatchScore").mockReturnValueOnce("50 - 30").mockReturnValueOnce("2 - 3");
    vi.spyOn(discordService, "getTimestamp")
      .mockReturnValueOnce("<t:1732615200:R>")
      .mockReturnValueOnce("<t:1732618800:R>");

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.value).toBe("Slayer on Live Fire\nCTF on Recharge");
    expect(result.fields?.[1]?.value).toBe("Win - 50 - 30\nLoss - 2 - 3");
    expect(result.fields?.[2]?.value).toBe("<t:1732615200:R>\n<t:1732618800:R>");
  });
});
