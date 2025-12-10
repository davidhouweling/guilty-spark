import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import { NeatQueuePlayersEmbed } from "../neatqueue-players-embed.mjs";
import type { NeatQueuePlayersEmbedData, PlayerData } from "../neatqueue-players-embed.mjs";
import { AssociationReason, GamesRetrievable } from "../../../services/database/types/discord_associations.mjs";
import type { DiscordAssociationsRow } from "../../../services/database/types/discord_associations.mjs";
import { MapsPostType } from "../../../services/database/types/guild_config.mjs";
import { EmbedColors } from "../../colors.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";

describe("NeatQueuePlayersEmbed", () => {
  let discordService: DiscordService;
  let haloService: HaloService;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    vi.spyOn(discordService, "getRankEmoji").mockReturnValue("🏅");
    vi.spyOn(haloService, "getRankTierFromCsr").mockReturnValue({ rankTier: "Platinum", subTier: 1 });
  });

  it("creates embed with connected players and ranks", () => {
    const players: PlayerData[] = [
      { id: "123", name: "PlayerOne" },
      { id: "456", name: "PlayerTwo" },
    ];

    const associations: DiscordAssociationsRow[] = [
      {
        DiscordId: "123",
        XboxId: "1000",
        AssociationReason: AssociationReason.CONNECTED,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
      {
        DiscordId: "456",
        XboxId: "2000",
        AssociationReason: AssociationReason.CONNECTED,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
    ];

    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
      ["2000", { xuid: "2000", gamertag: "Player2" }],
    ]);

    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map([
      [
        "1000",
        {
          Current: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 1,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1700,
            Tier: "Diamond",
            SubTier: 3,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
      [
        "2000",
        {
          Current: {
            Value: 1400,
            Tier: "Gold",
            SubTier: 5,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 2,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
    ]);

    const esras: NeatQueuePlayersEmbedData["esras"] = new Map([
      ["1000", 1450],
      ["2000", 1350],
    ]);

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.title).toBe("Players in queue");
    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.name).toBe("Player");
    expect(result.fields?.[0]?.value).toContain("<@123>");
    expect(result.fields?.[0]?.value).toContain("<@456>");
    expect(result.fields?.[1]?.name).toBe("Halo Profile");
    expect(result.fields?.[1]?.value).toContain("Player1");
    expect(result.fields?.[1]?.value).toContain("Player2");
    expect(result.fields?.[2]?.name).toBe("Current Rank (ESRA, ATP)");
    expect(result.fields?.[2]?.value).toContain("1500");
    expect(result.fields?.[2]?.value).toContain("1400");
  });

  it("shows indicator for guessed gamertags", () => {
    const players: PlayerData[] = [{ id: "123", name: "PlayerOne" }];

    const associations: DiscordAssociationsRow[] = [
      {
        DiscordId: "123",
        XboxId: "1000",
        AssociationReason: AssociationReason.GAME_SIMILARITY,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.NO,
        DiscordDisplayNameSearched: null,
      },
    ];

    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
    ]);
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    expect(result.fields?.[1]?.value).toContain("*");
    expect(result.description).toContain("* = guessed gamertag");
  });

  it("shows not connected for players without associations", () => {
    const players: PlayerData[] = [{ id: "123", name: "PlayerOne" }];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map();
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    expect(result.fields?.[1]?.value).toContain("*Not Connected*");
  });

  it("shows dash for players without rank data", () => {
    const players: PlayerData[] = [{ id: "123", name: "PlayerOne" }];
    const associations: DiscordAssociationsRow[] = [
      {
        DiscordId: "123",
        XboxId: "1000",
        AssociationReason: AssociationReason.CONNECTED,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
    ];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
    ]);
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    expect(result.fields?.[2]?.value).toBe("-");
  });

  it("includes connect and maps buttons when mapsPostType is BUTTON", () => {
    const players: PlayerData[] = [];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map();
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const { actions } = embed;

    expect(actions).toHaveLength(1);
    const [firstAction] = actions;
    expect(firstAction?.type).toBe(ComponentType.ActionRow);
    if (firstAction?.type === ComponentType.ActionRow) {
      expect(firstAction.components).toHaveLength(2);
      expect(firstAction.components[0]).toMatchObject({
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: "Connect my Halo account",
        custom_id: "btn_connect_initiate",
      });
      expect(firstAction.components[1]).toMatchObject({
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: "Generate maps",
        custom_id: "btn_maps_initiate",
      });
    }
  });

  it("only includes connect button when mapsPostType is not BUTTON", () => {
    const players: PlayerData[] = [];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map();
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.AUTO,
      },
    );

    const { actions } = embed;

    expect(actions).toHaveLength(1);
    const [firstAction] = actions;
    expect(firstAction?.type).toBe(ComponentType.ActionRow);
    if (firstAction?.type === ComponentType.ActionRow) {
      expect(firstAction.components).toHaveLength(1);
      expect(firstAction.components[0]).toMatchObject({
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: "Connect my Halo account",
        custom_id: "btn_connect_initiate",
      });
    }
  });

  it("only includes connect button when mapsPostType is not BUTTON", () => {
    const players: PlayerData[] = [];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map();
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.AUTO,
      },
    );

    const result = embed.embed;

    expect(result.fields).toHaveLength(3);
    // All fields should be empty when no players
    const fields = result.fields ?? [];
    expect(fields[0]?.value).toBe("");
    expect(fields[1]?.value).toBe("");
    expect(fields[2]?.value).toBe("");
  });

  it("sorts players alphabetically by name", () => {
    const players: PlayerData[] = [
      { id: "123", name: "Charlie" },
      { id: "456", name: "Alice" },
      { id: "789", name: "Bob" },
    ];

    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map();
    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map();
    const esras: NeatQueuePlayersEmbedData["esras"] = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    // Players should be sorted: Alice, Bob, Charlie
    const fields = result.fields ?? [];
    const playerValues = fields[0]?.value.split("\n") ?? [];
    expect(playerValues[0]).toContain("456"); // Alice
    expect(playerValues[1]).toContain("789"); // Bob
    expect(playerValues[2]).toContain("123"); // Charlie
  });

  it("formats ESRA with rank emoji and rounded value", () => {
    const getRankTierFromCsrSpy = vi.spyOn(haloService, "getRankTierFromCsr");
    const getRankEmojiSpy = vi.spyOn(discordService, "getRankEmoji");

    const players: PlayerData[] = [
      { id: "123", name: "Player1" },
      { id: "456", name: "Player2" },
    ];

    const associations: DiscordAssociationsRow[] = [
      {
        DiscordId: "123",
        XboxId: "1000",
        AssociationReason: AssociationReason.MANUAL,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
      {
        DiscordId: "456",
        XboxId: "2000",
        AssociationReason: AssociationReason.MANUAL,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
    ];

    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
      ["2000", { xuid: "2000", gamertag: "Player2" }],
    ]);

    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map([
      [
        "1000",
        {
          Current: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 1,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1600,
            Tier: "Diamond",
            SubTier: 1,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
      [
        "2000",
        {
          Current: {
            Value: 1400,
            Tier: "Gold",
            SubTier: 5,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 2,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
    ]);

    const esras: NeatQueuePlayersEmbedData["esras"] = new Map([
      ["1000", 1450.7], // Should round to 1451
      ["2000", 1349.3], // Should round to 1349
    ]);

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;
    const rankField = result.fields?.[2]?.value ?? "";

    expect(getRankTierFromCsrSpy).toHaveBeenCalledWith(1451);
    expect(getRankTierFromCsrSpy).toHaveBeenCalledWith(1349);

    expect(getRankEmojiSpy).toHaveBeenCalledWith({
      rankTier: "Platinum",
      subTier: 1,
      measurementMatchesRemaining: 0,
      initialMeasurementMatches: 0,
    });

    // Check that the formatted ESRA includes emoji and rounded value
    expect(rankField).toContain("🏅1451");
    expect(rankField).toContain("🏅1349");
  });

  it("displays dash for zero or negative ESRA", () => {
    const players: PlayerData[] = [
      { id: "123", name: "Player1" },
      { id: "456", name: "Player2" },
    ];

    const associations: DiscordAssociationsRow[] = [
      {
        DiscordId: "123",
        XboxId: "1000",
        AssociationReason: AssociationReason.MANUAL,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
      {
        DiscordId: "456",
        XboxId: "2000",
        AssociationReason: AssociationReason.MANUAL,
        AssociationDate: Date.now(),
        GamesRetrievable: GamesRetrievable.YES,
        DiscordDisplayNameSearched: null,
      },
    ];

    const haloPlayersMap: NeatQueuePlayersEmbedData["haloPlayersMap"] = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
      ["2000", { xuid: "2000", gamertag: "Player2" }],
    ]);

    const rankedArenaCsrs: NeatQueuePlayersEmbedData["rankedArenaCsrs"] = new Map([
      [
        "1000",
        {
          Current: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 1,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1600,
            Tier: "Diamond",
            SubTier: 1,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
      [
        "2000",
        {
          Current: {
            Value: 1400,
            Tier: "Gold",
            SubTier: 5,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
          AllTimeMax: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 2,
            MeasurementMatchesRemaining: 0,
            InitialMeasurementMatches: 10,
          },
        },
      ],
    ]);

    const esras: NeatQueuePlayersEmbedData["esras"] = new Map([
      ["1000", 0], // Zero ESRA
      ["2000", -5], // Negative ESRA (edge case)
    ]);

    const embed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    // Create spies to verify method calls
    const getRankTierFromCsrSpy = vi.spyOn(haloService, "getRankTierFromCsr");

    const result = embed.embed;
    const rankField = result.fields?.[2]?.value ?? "";

    // Both should show dash for ESRA
    const lines = rankField.split("\n");
    expect(lines[0]).toMatch(/\(-, 🏅1600\)/); // ESRA is dash, ATP is 1600
    expect(lines[1]).toMatch(/\(-, 🏅1500\)/); // ESRA is dash, ATP is 1500

    // Verify getRankTierFromCsr was NOT called for zero/negative ESRA
    expect(getRankTierFromCsrSpy).not.toHaveBeenCalledWith(0);
    expect(getRankTierFromCsrSpy).not.toHaveBeenCalledWith(-5);
  });
});
