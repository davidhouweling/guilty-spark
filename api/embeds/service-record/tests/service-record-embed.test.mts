import { describe, beforeEach, it, expect } from "vitest";
import type { PlaylistCsr, PlaylistCsrContainer } from "halo-infinite-api";
import { ServiceRecordEmbed } from "../service-record-embed.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { AssociationReason } from "../../../services/database/types/discord_associations.mjs";
import type { Services } from "../../../services/install.mjs";
import { aFakeServiceRecordWith } from "../../../services/halo/fakes/data.mjs";

describe("ServiceRecordEmbed", () => {
  let env: Env;
  let services: Services;

  const mockServiceRecord = aFakeServiceRecordWith({
    TimePlayed: "PT100H30M15S",
    MatchesCompleted: 500,
    Wins: 300,
    Losses: 180,
    Ties: 20,
    CoreStats: {
      ...aFakeServiceRecordWith().CoreStats,
      DamageDealt: 500000,
      DamageTaken: 450000,
    },
  });

  const mockCsr: PlaylistCsr = {
    Value: 1450,
    Tier: "Diamond",
    SubTier: 5,
    MeasurementMatchesRemaining: 0,
    TierStart: 1450,
    NextTier: "Onyx",
    NextTierStart: 1500,
    InitialMeasurementMatches: 10,
    DemotionProtectionMatchesRemaining: 0,
    InitialDemotionProtectionMatches: 5,
    NextSubTier: 0,
  };

  const mockCsrContainer: PlaylistCsrContainer = {
    Current: mockCsr,
    SeasonMax: { ...mockCsr, Value: 1480 },
    AllTimeMax: { ...mockCsr, Value: 1520 },
  };

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
  });

  describe("embed", () => {
    it("includes basic service record information", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: 1350,
        },
      );

      const result = embed.embed;

      expect(result.title).toBe("Service record");
      expect(result.description).toContain("**Discord user**: <@123456789>");
      expect(result.description).toContain("**Xbox Gamertag:** TestGamer");
      expect(result.description).toContain("**Matchmaking games completed:** 500");
      expect(result.description).toContain("**Wins : Losses : Ties:** 300 : 180 : 20");
    });

    it("formats time played correctly", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Time played:**");
    });

    it("displays win percentage correctly", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Win percentage: ** 60%");
    });

    it("displays damage ratio correctly", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Total Damage D:T (D/T):** 500,000 : 450,000 (1.11)");
    });

    it("displays CSR information correctly", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Current Ranked Arena CSR:**");
      expect(result.description).toContain("**Season Peak Ranked Arena CSR:**");
      expect(result.description).toContain("**All Time Peak Ranked Arena CSR:**");
    });

    it("displays ESRA when provided", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: 1350,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Expected Skill Rating Averaged - ESRA:**");
      expect(result.description).toContain("1350");
    });

    it("displays dash for ESRA when undefined", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Expected Skill Rating Averaged - ESRA:** -");
    });

    it("formats association reason for CONNECTED", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Association reason:** Xbox Connected");
    });

    it("formats association reason for USERNAME_SEARCH", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.USERNAME_SEARCH,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Association reason:** Username matched");
    });

    it("formats association reason for DISPLAY_NAME_SEARCH", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.DISPLAY_NAME_SEARCH,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Association reason:** Display Name matched");
    });

    it("formats association reason for GAME_SIMILARITY", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.GAME_SIMILARITY,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Association reason:** Matched via games played");
    });

    it("formats association reason for MANUAL", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.MANUAL,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("**Association reason:** Manually Connected");
    });

    it("handles zero damage taken with infinity symbol", () => {
      const recordWithNoDamageTaken = {
        ...mockServiceRecord,
        CoreStats: {
          ...mockServiceRecord.CoreStats,
          DamageTaken: 0,
        },
      };

      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: recordWithNoDamageTaken,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("♾️");
    });

    it("handles zero damage dealt", () => {
      const recordWithNoDamageDealt = {
        ...mockServiceRecord,
        CoreStats: {
          ...mockServiceRecord.CoreStats,
          DamageDealt: 0,
        },
      };

      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: recordWithNoDamageDealt,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.description).toContain("(0)");
    });

    it("includes footer with caching notice", () => {
      const embed = new ServiceRecordEmbed(
        { haloService: services.haloService, discordService: services.discordService },
        {
          locale: "en-US",
          discordUserId: "123456789",
          gamertag: "TestGamer",
          associationReason: AssociationReason.CONNECTED,
          serviceRecord: mockServiceRecord,
          csr: mockCsrContainer,
          esra: undefined,
        },
      );

      const result = embed.embed;

      expect(result.footer).toBeDefined();
      expect(result.footer?.text).toBe("Some data cached for up to 1 day");
    });
  });
});
