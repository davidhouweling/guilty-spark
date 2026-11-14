import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { HaloInfiniteClient, MatchType } from "halo-infinite-api";
import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeHaloInfiniteClient } from "../../../services/halo/fakes/infinite-client.fake";
import { aFakePlayerMatchHistoryWith, getAssetVersion } from "../../../services/halo/fakes/data";
import { aFakeLinkedIdentitiesRow } from "../../../services/database/fakes/database.fake";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";
import type { AuthService } from "../../../services/auth/auth";
import { prepareMatchHistoryPage } from "../../../services/halo/prepare-match-history";

vi.mock("halo-infinite-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HaloInfiniteApi>();
  return { ...actual, HaloInfiniteClient: vi.fn(), StaticXstsTicketTokenSpartanTokenProvider: vi.fn() };
});

describe("GET arbitrary player match history", () => {
  const env = aFakeEnvWith();
  let services: ReturnType<typeof installFakeServicesWith>;
  let client: ReturnType<typeof aFakeHaloInfiniteClient>;
  let router: ReturnType<typeof createApiRouter>;
  let validateSession: MockInstance<AuthService["validateSessionWithAuthMetadata"]>;

  beforeEach(() => {
    client = aFakeHaloInfiniteClient();
    services = installFakeServicesWith({ env, haloInfiniteClient: client });
    validateSession = vi.spyOn(services.authService, "validateSessionWithAuthMetadata").mockResolvedValue(null);
    router = createApiRouter();
    individualTrackerRoutesRegisterHandler(router, () => services);
  });

  async function fetchHistory(query = ""): Promise<Response> {
    return await router.fetch(
      new Request(`http://localhost/api/individual-tracker/search/1111111111/matches${query}`),
      env,
    );
  }

  it("uses the anonymous bot with offset, count and category, and preserves empty-page semantics", async () => {
    const response = await fetchHistory("?start=25&count=25&category=custom");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(client.getPlayerMatches).toHaveBeenCalledWith("1111111111", MatchType.Custom, 25, 25);
    expect(await condensedMatchHistoryPageContract.fromResponse(response)).toEqual({
      matches: [],
      suggestedGroupings: [],
    });
  });

  it.each([
    "?start=-1",
    "?start=1.5",
    "?start=9007199254740992",
    "?start=",
    "?count=0",
    "?count=26",
    "?count=1e1",
    "?category=ranked",
    "?count=1&count=2",
  ])("rejects invalid query %s before resolving credentials", async (query) => {
    const response = await fetchHistory(query);
    expect(response.status).toBe(400);
    expect(validateSession).not.toHaveBeenCalled();
    expect(client.getPlayerMatches).not.toHaveBeenCalled();
  });

  it("returns condensed ordered results, metadata, names and explicit missing detail", async () => {
    const detail = aFakeMatchStatsWith({
      MatchId: "first",
      Players: [aFakePlayerWith({ PlayerId: "xuid(1111111111)", PlayerType: 1 })],
    });
    const matches = ["first", "missing"].map((MatchId) =>
      aFakePlayerMatchHistoryWith({
        MatchId,
        MatchInfo: { ...detail.MatchInfo, Playlist: detail.MatchInfo.MapVariant },
      }),
    );
    vi.spyOn(client, "getPlayerMatches").mockResolvedValue(matches);
    vi.spyOn(client, "getMatchStats").mockImplementation(async (id) => {
      if (id === "missing") {
        throw new Error("unavailable");
      }
      return await Promise.resolve(detail);
    });
    const asset = getAssetVersion();
    asset.PublicName = "Asset Name";
    asset.Files.Prefix = "https://example.test/";
    asset.Files.FileRelativePaths = ["hero.png", "thumbnail.png"];
    vi.spyOn(client, "getSpecificAssetVersion").mockResolvedValue(asset);
    vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "1111111111", gamertag: "Chief" }]);
    const warn = vi.spyOn(services.logService, "warn");
    const response = await fetchHistory();
    expect(response.status).toBe(200);
    expect(client.getPlayerMatches).toHaveBeenCalledWith("1111111111", MatchType.All, 25, 0);
    const page = await condensedMatchHistoryPageContract.fromResponse(response);
    expect(page.matches.map((match) => match.matchId)).toEqual(["first", "missing"]);
    expect(page.matches[0]).toMatchObject({
      mapName: "Asset Name",
      modeName: "Asset Name",
      mapThumbnailUrl: "https://example.test/thumbnail.png",
      matchmakingPlaylist: "Asset Name",
      category: "matchmaking",
      teams: [["Chief"]],
    });
    expect(page.matches[0]?.teamRosterSignature).not.toBeNull();
    expect(page.matches[0]?.score).not.toBeNull();
    expect(page.matches[0]?.trackedPlayerSummary).not.toBeNull();
    expect(page.matches[1]).toMatchObject({
      teams: [],
      score: null,
      teamRosterSignature: null,
      trackedPlayerSummary: null,
    });
    expect(JSON.stringify(page)).not.toContain("rawMatchStats");
    expect(client.getSpecificAssetVersion).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("fails rather than silently succeeding when every detail request fails", async () => {
    vi.spyOn(client, "getPlayerMatches").mockResolvedValue([aFakePlayerMatchHistoryWith({ MatchId: "missing" })]);
    vi.spyOn(client, "getMatchStats").mockRejectedValue(new Error("upstream failed"));
    const error = vi.spyOn(services.logService, "error");
    const response = await fetchHistory();
    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalled();
  });

  it("fails when history or required metadata cannot be fetched", async () => {
    vi.spyOn(client, "getPlayerMatches")
      .mockRejectedValueOnce(new Error("history failed"))
      .mockResolvedValueOnce([aFakePlayerMatchHistoryWith({ MatchId: "first" })]);
    vi.spyOn(client, "getMatchStats").mockResolvedValue(aFakeMatchStatsWith({ MatchId: "first" }));
    vi.spyOn(client, "getSpecificAssetVersion").mockRejectedValue(new Error("asset failed"));
    expect((await fetchHistory()).status).toBe(500);
    expect((await fetchHistory()).status).toBe(500);
  });

  it("rejects malformed player ids without resolving credentials", async () => {
    const response = await router.fetch(
      new Request("http://localhost/api/individual-tracker/search/not-a-xuid/matches"),
      env,
    );
    expect(response.status).toBe(400);
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("enforces page bounds in preparation independently of the route", async () => {
    await expect(
      prepareMatchHistoryPage(client, services.haloService, services.logService, "111", {
        start: 0,
        count: 26,
        category: "all",
      }),
    ).rejects.toThrow("Invalid match history page");
    expect(client.getPlayerMatches).not.toHaveBeenCalled();
  });

  it("uses the owner client without a session and falls back to bot on lookup failure", async () => {
    const owner = aFakeHaloInfiniteClient();
    vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag")
      .mockResolvedValueOnce(
        aFakeLinkedIdentitiesRow({ UserId: "owner", Gamertag: "Owner", IsActive: 1, Provider: "xbox" }),
      )
      .mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(owner);
    expect((await fetchHistory("?gamertag=Owner")).status).toBe(200);
    expect(owner.getPlayerMatches).toHaveBeenCalledOnce();
    expect(client.getPlayerMatches).not.toHaveBeenCalled();
    expect((await fetchHistory("?gamertag=Owner")).status).toBe(200);
    expect(client.getPlayerMatches).toHaveBeenCalledOnce();
  });

  it("uses owner credentials for history, details and assets while names use the proxy cache service", async () => {
    const owner = aFakeHaloInfiniteClient();
    const detail = aFakeMatchStatsWith({ MatchId: "owner-match" });
    vi.spyOn(owner, "getPlayerMatches").mockResolvedValue([
      aFakePlayerMatchHistoryWith({ MatchId: detail.MatchId, MatchInfo: detail.MatchInfo }),
    ]);
    vi.spyOn(owner, "getMatchStats").mockResolvedValue(detail);
    vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(
      aFakeLinkedIdentitiesRow({ UserId: "owner", Gamertag: "Owner", IsActive: 1, Provider: "xbox" }),
    );
    vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(owner);
    const users = vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([]);
    const response = await fetchHistory("?gamertag=Owner&count=1");
    const page = await condensedMatchHistoryPageContract.fromResponse(response);
    expect(page.matches).toHaveLength(1);
    expect(page.matches[0]?.matchId).toBe("owner-match");
    expect(owner.getMatchStats).toHaveBeenCalledWith("owner-match");
    expect(owner.getSpecificAssetVersion).toHaveBeenCalled();
    expect(client.getMatchStats).not.toHaveBeenCalled();
    expect(users).toHaveBeenCalledOnce();
  });

  it("prefers cached session XSTS over owner credentials without returning tokens", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    vi.mocked(HaloInfiniteClient).mockImplementation(function () {
      return sessionClient;
    });
    validateSession.mockResolvedValue({
      session: {
        sessionId: "s",
        userId: "u",
        accessToken: "secret-access",
        refreshToken: undefined,
        expiresAt: Date.now() + 100000,
        isExpired: false,
      },
      authMetadata: {},
    });
    vi.spyOn(services.authService, "getCachedHaloXstsTokenForAuthMetadata").mockResolvedValue({
      XSTSToken: "secret-xsts",
      userHash: "hash",
      expiresOn: new Date(Date.now() + 100000),
    });
    const lookup = vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag");
    const response = await fetchHistory("?gamertag=Owner");
    expect(response.status).toBe(200);
    expect(sessionClient.getPlayerMatches).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("secret");
  });

  it("preserves unauthorized refresh behavior", async () => {
    validateSession.mockResolvedValue({
      session: {
        sessionId: "s",
        userId: "u",
        accessToken: "expired",
        refreshToken: "r",
        expiresAt: Date.now() - 1,
        isExpired: true,
      },
      authMetadata: {},
    });
    vi.spyOn(services.authService, "getCachedHaloXstsTokenForAuthMetadata").mockResolvedValue(null);
    vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);
    const response = await fetchHistory();
    expect(response.status).toBe(401);
    expect(client.getPlayerMatches).not.toHaveBeenCalled();
  });
});
