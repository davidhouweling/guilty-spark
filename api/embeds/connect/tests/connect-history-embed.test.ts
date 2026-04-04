import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectHistoryEmbed } from "../connect-history-embed";
import { EmbedColors } from "../../colors";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeMatchHistoryEntryWith } from "../../../services/halo/fakes/data";

describe("ConnectHistoryEmbed", () => {
  let discordService: ReturnType<typeof aFakeDiscordServiceWith>;
  let haloService: ReturnType<typeof aFakeHaloServiceWith>;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
  });

  it("creates embed with match history", async () => {
    const match = aFakeMatchHistoryEntryWith({
      matchId: "match-001",
      mapName: "Live Fire",
      modeName: "Slayer",
      outcome: "Win",
      resultString: "Win - 50:30",
      endTime: "2023-01-01T12:00:00Z",
      isMatchmaking: false,
    });
    const getEnrichedMatchHistorySpy = vi
      .spyOn(haloService, "getEnrichedMatchHistory")
      .mockResolvedValue({ gamertag: "TestPlayer", xuid: "xuid-123", matches: [match], suggestedGroupings: [] });
    vi.spyOn(discordService, "getTimestamp").mockReturnValue("<t:1732615200:R>");

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(getEnrichedMatchHistorySpy).toHaveBeenCalledWith("TestPlayer", "en-US", 2, 10);
    expect(result.title).toBe('Recent custom game matches for "TestPlayer"');
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.name).toBe("Game");
    expect(result.fields?.[0]?.value).toBe("Slayer: Live Fire");
    expect(result.fields?.[1]?.name).toBe("Result");
    expect(result.fields?.[1]?.value).toBe("Win - 50:30");
    expect(result.fields?.[2]?.name).toBe("When");
    expect(result.fields?.[2]?.value).toBe("<t:1732615200:R>");
  });

  it("uses custom title and description when provided", async () => {
    vi.spyOn(haloService, "getEnrichedMatchHistory").mockResolvedValue({
      gamertag: "TestPlayer",
      xuid: "xuid-123",
      matches: [],
      suggestedGroupings: [],
    });

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
    vi.spyOn(haloService, "getEnrichedMatchHistory").mockResolvedValue({
      gamertag: "TestPlayer",
      xuid: "xuid-123",
      matches: [],
      suggestedGroupings: [],
    });

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(result.fields).toHaveLength(1);
    expect(result.fields?.[0]?.name).toBe("No custom game matches found");
    expect(result.fields?.[0]?.value).toContain("To resolve, either:");
    expect(result.fields?.[0]?.value).toContain("Halo Waypoint Privacy settings");
  });

  it("handles multiple matches", async () => {
    const match1 = aFakeMatchHistoryEntryWith({
      matchId: "match-001",
      mapName: "Live Fire",
      modeName: "Slayer",
      outcome: "Win",
      resultString: "Win - 50:30",
      endTime: "2023-01-01T12:00:00Z",
      isMatchmaking: false,
    });
    const match2 = aFakeMatchHistoryEntryWith({
      matchId: "match-002",
      mapName: "Recharge",
      modeName: "CTF",
      outcome: "Loss",
      resultString: "Loss - 2:3",
      endTime: "2023-01-01T13:00:00Z",
      isMatchmaking: false,
    });

    vi.spyOn(haloService, "getEnrichedMatchHistory").mockResolvedValue({
      gamertag: "TestPlayer",
      xuid: "xuid-123",
      matches: [match1, match2],
      suggestedGroupings: [],
    });
    vi.spyOn(discordService, "getTimestamp")
      .mockReturnValueOnce("<t:1732615200:R>")
      .mockReturnValueOnce("<t:1732618800:R>");

    const embed = new ConnectHistoryEmbed({ discordService, haloService }, { gamertag: "TestPlayer", locale: "en-US" });

    const result = await embed.getEmbed();

    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.value).toBe("Slayer: Live Fire\nCTF: Recharge");
    expect(result.fields?.[1]?.value).toBe("Win - 50:30\nLoss - 2:3");
    expect(result.fields?.[2]?.value).toBe("<t:1732615200:R>\n<t:1732618800:R>");
  });
});
