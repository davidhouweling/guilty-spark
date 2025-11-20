import { describe, it, expect, beforeEach, vi } from "vitest";
import { NeatQueuePlayersEmbed } from "../neatqueue-players-embed.mjs";
import type { PlayerData } from "../neatqueue-players-embed.mjs";
import { AssociationReason, GamesRetrievable } from "../../../services/database/types/discord_associations.mjs";
import type { DiscordAssociationsRow } from "../../../services/database/types/discord_associations.mjs";
import { MapsPostType } from "../../../services/database/types/guild_config.mjs";
import { EmbedColors } from "../../colors.mjs";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";

describe("NeatQueuePlayersEmbed", () => {
  let discordService: DiscordService;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    vi.spyOn(discordService, "getRankEmoji").mockReturnValue("🏅");
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

    const haloPlayersMap = new Map([
      ["1000", { xuid: "1000", gamertag: "Player1" }],
      ["2000", { xuid: "2000", gamertag: "Player2" }],
    ]);

    const rankedArenaCsrs = new Map([
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
          SeasonMax: {
            Value: 1600,
            Tier: "Diamond",
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
          SeasonMax: {
            Value: 1500,
            Tier: "Platinum",
            SubTier: 2,
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

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
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
    expect(result.fields?.[2]?.name).toBe("Current Rank (SP, ATP)");
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

    const haloPlayersMap = new Map([["1000", { xuid: "1000", gamertag: "Player1" }]]);

    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
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

    const haloPlayersMap = new Map();

    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
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

    const haloPlayersMap = new Map([["1000", { xuid: "1000", gamertag: "Player1" }]]);

    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    expect(result.fields?.[2]?.value).toBe("-");
  });

  it("includes connect and maps buttons when mapsPostType is BUTTON", () => {
    const players: PlayerData[] = [];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap = new Map();
    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const actions = embed.actions;

    expect(actions).toHaveLength(1);
    const firstAction = actions[0];
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
    const haloPlayersMap = new Map();
    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        mapsPostType: MapsPostType.AUTO,
      },
    );

    const actions = embed.actions;

    expect(actions).toHaveLength(1);
    const firstAction = actions[0];
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

  it("handles empty players list", () => {
    const players: PlayerData[] = [];
    const associations: DiscordAssociationsRow[] = [];
    const haloPlayersMap = new Map();
    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        mapsPostType: MapsPostType.BUTTON,
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
    const haloPlayersMap = new Map();
    const rankedArenaCsrs = new Map();

    const embed = new NeatQueuePlayersEmbed(
      { discordService },
      {
        players,
        discordAssociations: associations,
        haloPlayersMap,
        rankedArenaCsrs,
        mapsPostType: MapsPostType.BUTTON,
      },
    );

    const result = embed.embed;

    // Players should be sorted: Alice, Bob, Charlie
    const fields = result.fields ?? [];
    const playerValues = fields[0]?.value.split("\n") || [];
    expect(playerValues[0]).toContain("456"); // Alice
    expect(playerValues[1]).toContain("789"); // Bob
    expect(playerValues[2]).toContain("123"); // Charlie
  });
});
