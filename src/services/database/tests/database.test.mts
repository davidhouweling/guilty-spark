import { describe, it, expect, beforeEach, vi } from "vitest";
import { aFakeEnvWith, fakeD1Response, FakePreparedStatement } from "../../../base/fakes/env.fake.mjs";
import { DatabaseService } from "../database.mjs";
import { aFakeDiscordAssociationsRow } from "../fakes/database.fake.mjs";

describe("Database Service", () => {
  let env: Env;
  let databaseService: DatabaseService;

  beforeEach(() => {
    env = aFakeEnvWith();
    databaseService = new DatabaseService({ env });
  });

  describe("getDiscordAssociations()", () => {
    it("gets Discord associations from the database", async () => {
      const association1 = aFakeDiscordAssociationsRow({ DiscordId: "discordId1", XboxId: "xboxId1" });
      const association2 = aFakeDiscordAssociationsRow({ DiscordId: "discordId2", XboxId: "xboxId2" });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const allSpy = vi
        .spyOn(fakePreparedStatement, "all")
        .mockResolvedValue({ ...fakeD1Response, results: [association1, association2] });

      const discordAssociations = await databaseService.getDiscordAssociations(["discordId", "discordId2"]);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM DiscordAssociations WHERE DiscordId IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("discordId", "discordId2");
      expect(allSpy).toHaveBeenCalled();

      expect(discordAssociations).toEqual([association1, association2]);
    });
  });

  describe("upsertDiscordAssociations()", () => {
    it("upserts Discord associations in the database", async () => {
      const association1 = aFakeDiscordAssociationsRow({
        DiscordId: "discordId1",
        XboxId: "xboxId1",
        AssociationDate: new Date("2025-01-01T06:00:00.000Z").getTime(),
      });
      const association2 = aFakeDiscordAssociationsRow({
        DiscordId: "discordId2",
        XboxId: "xboxId2",
        AssociationDate: new Date("2025-01-01T07:00:00.000Z").getTime(),
      });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertDiscordAssociations([association1, association2]);

      const query = `
      INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable) VALUES (?, ?, ?, ?, ?),(?, ?, ?, ?, ?)
      ON CONFLICT(DiscordId) DO UPDATE SET XboxId=excluded.XboxId, AssociationReason=excluded.AssociationReason, AssociationDate=excluded.AssociationDate, GamesRetrievable=excluded.GamesRetrievable
    `;
      expect(prepareSpy).toHaveBeenCalledWith(query);
      expect(bindSpy).toHaveBeenCalledWith(
        association1.DiscordId,
        association1.XboxId,
        association1.AssociationReason,
        association1.AssociationDate,
        association1.GamesRetrievable,
        association2.DiscordId,
        association2.XboxId,
        association2.AssociationReason,
        association2.AssociationDate,
        association2.GamesRetrievable,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteDiscordAssociations()", () => {
    it("deletes Discord associations from the database", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteDiscordAssociations(["discordId", "discordId2"]);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM DiscordAssociations WHERE DiscordId IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("discordId", "discordId2");
      expect(runSpy).toHaveBeenCalled();
    });
  });
});
