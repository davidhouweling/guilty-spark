import type { AutoRouterType } from "itty-router";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { overlayPreviewContract } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeAuthSessionWith, aFakeSessionTokenPayload } from "../../../services/auth/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { getPlayerMatches, getRankedArenaCsrsData } from "../../../services/halo/fakes/data";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

const TRACKED_XUID = "1111111111";

function aCustomMatch(matchId: string, startTime: string): MatchStats {
  const base = aFakeMatchStatsWith({ MatchId: matchId });
  return {
    ...base,
    MatchInfo: { ...base.MatchInfo, StartTime: startTime, EndTime: startTime, Playlist: null },
  };
}

function aPlayerMatch(stats: MatchStats): PlayerMatchHistory {
  const template = Preconditions.checkExists(getPlayerMatches().at(0), "player match fixture");
  return { ...template, MatchId: stats.MatchId, MatchInfo: stats.MatchInfo };
}

function aSwappedMatch(matchId: string, startTime: string): MatchStats {
  const base = aCustomMatch(matchId, startTime);
  return {
    ...base,
    Players: base.Players.map((player) => ({
      ...player,
      LastTeamId: 1 - player.LastTeamId,
      PlayerTeamStats: player.PlayerTeamStats.map((team) => ({ ...team, TeamId: 1 - team.TeamId })),
    })),
  };
}

function withHistory(stats: readonly MatchStats[]): typeof installFakeServicesWith {
  return (opts) => {
    const services = installFakeServicesWith(opts);
    vi.spyOn(services.haloService, "getPlayerMatches").mockResolvedValue(stats.map(aPlayerMatch));
    vi.spyOn(services.haloService, "getMatchDetails").mockImplementation(async (ids) =>
      Promise.resolve(stats.filter((match) => ids.includes(match.MatchId))),
    );
    return services;
  };
}

function withSession(installServicesFn: typeof installFakeServicesWith): typeof installFakeServicesWith {
  return (opts) => {
    const services = installServicesFn(opts);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(
      aFakeAuthSessionWith({ userId: "user-123", xboxXuid: TRACKED_XUID, xboxGamertag: "ChiefSpartan" }),
    );
    vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(services.haloInfiniteClient);
    vi.spyOn(services.haloService, "withUserClient").mockReturnValue(services.haloService);
    return services;
  };
}

function postPreviewRequest(path: string, previewSettings?: StreamerViewSettings): Request {
  const url = new URL(path, "http://localhost");
  const mode = url.searchParams.get("mode");
  const slots = url.searchParams.get("statsHighlightSlots");
  const settings =
    previewSettings ??
    (slots == null ? undefined : { visibleSections: { statsHighlightSlots: slots.split(",") } });
  const body = {
    ...(mode != null ? { mode } : {}),
    ...(settings !== undefined ? { previewSettings: settings } : {}),
  };
  return new Request(`${url.origin}${url.pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/individual-tracker/overlay-preview", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("serves the demo identity when there is no session", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(res.status).toBe(200);
    expect(body.isExample).toBe(true);
    expect(body.view.gamertag).toBe("soundmanD");
  });

  it("serves the session user's own identity when authenticated", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withSession(withHistory(stats))({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.isExample).toBe(false);
    expect(body.view.gamertag).toBe("ChiefSpartan");
  });

  it("uses the owner's Halo client for authenticated preview history", async () => {
    const stats = [aCustomMatch("owner-match", "2026-09-01T10:00:00.000Z")];
    const ownerService = withHistory(stats)({ env }).haloService;
    let ownerLookup:
      MockInstance<ReturnType<typeof installFakeServicesWith>["userTokenProvider"]["getClientForUser"]> | undefined;
    let ownerClient:
      MockInstance<ReturnType<typeof installFakeServicesWith>["haloService"]["withUserClient"]> | undefined;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(installFakeServicesWith)({ env });
      ownerLookup = vi
        .spyOn(services.userTokenProvider, "getClientForUser")
        .mockResolvedValue(services.haloInfiniteClient);
      ownerClient = vi.spyOn(services.haloService, "withUserClient").mockReturnValue(ownerService);
      vi.spyOn(services.haloService, "getPlayerMatches").mockRejectedValue(new Error("bot client used"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.matches[0]?.matchId).toBe("owner-match");
    expect(ownerLookup).toHaveBeenCalledWith("user-123");
    expect(ownerClient).toHaveBeenCalled();
  });

  it("does not silently use bot credentials when the owner client is unavailable", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(installFakeServicesWith)({ env });
      vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;

    expect(res.status).toBe(500);
  });

  it("refreshes an expired session before selecting the user's preview and settings", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(
        aFakeAuthSessionWith({
          userId: "user-123",
          xboxXuid: TRACKED_XUID,
          xboxGamertag: "ChiefSpartan",
          isExpired: true,
        }),
      );
      vi.spyOn(services.authService, "refreshSession").mockResolvedValue(aFakeSessionTokenPayload());
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: [] },
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.isExample).toBe(false);
    expect(body.view.gamertag).toBe("ChiefSpartan");
    expect(body.view.statsHighlights).toEqual([]);
  });

  it("falls back to the demo and clears an unrefreshable session cookie", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(
        aFakeAuthSessionWith({ isExpired: true, xboxXuid: TRACKED_XUID, xboxGamertag: "ChiefSpartan" }),
      );
      vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.isExample).toBe(true);
    expect(body.view.gamertag).toBe("soundmanD");
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("defaults to the matchmaking mode with no active series", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.mode).toBe("matchmaking");
    expect(body.view.hasActiveSeries).toBe(false);
    expect(body.view.statsHighlights).toBeDefined();
  });

  it("uses preview settings as an ephemeral override over saved user settings", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    let updateSettingsCalled = false;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: ["total-games"] },
      });
      vi.spyOn(services.individualTrackerService, "updateSettings").mockImplementation(async () => {
        updateSettingsCalled = true;
        return Promise.resolve({});
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview", {
        styleFlags: { colorMode: "observer" },
        visibleSections: { statsHighlightSlots: ["kda"] },
      }),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(response);

    expect(body.view.streamerSettings?.styleFlags?.colorMode).toBe("observer");
    expect(body.view.statsHighlights?.map((highlight) => highlight.label)).toEqual(["KDA"]);
    expect(updateSettingsCalled).toBe(false);
  });

  it("builds an active series from grouped custom matches in series mode", async () => {
    const stats = [
      aCustomMatch("series-1", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("series-2", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.mode).toBe("series");
    expect(body.view.hasActiveSeries).toBe(true);
    expect(body.view.series).toHaveLength(1);
    expect(body.view.series[0]?.matchIds).toEqual(["series-1", "series-2"]);
    expect(body.view.activeSeriesContext?.title).toBe(body.view.series[0]?.title);
  });

  it("does not fabricate a series from unrelated custom matches", async () => {
    const first = aCustomMatch("unrelated-1", "2026-09-01T10:00:00.000Z");
    const second = aCustomMatch("unrelated-2", "2026-09-01T10:30:00.000Z");
    const stats = [
      first,
      {
        ...second,
        Players: second.Players.map((player, index) =>
          index === 0 ? { ...player, PlayerId: "xuid(9999999999)" } : player,
        ),
      },
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.hasActiveSeries).toBe(false);
    expect(body.view.series).toEqual([]);
    expect(body.view.matches).toEqual([]);
  });

  it("uses the latest chronological grouping and anchors teams to its first match after a side swap", async () => {
    const earlierBase = aCustomMatch("earlier-1", "2026-09-01T09:00:00.000Z");
    const earlierSecondBase = aCustomMatch("earlier-2", "2026-09-01T09:30:00.000Z");
    const earlier = {
      ...earlierBase,
      Players: earlierBase.Players.map((player, index) =>
        index === 0 ? { ...player, PlayerId: "xuid(9999999999)" } : player,
      ),
    };
    const earlierSecond = {
      ...earlierSecondBase,
      Players: earlierSecondBase.Players.map((player, index) =>
        index === 0 ? { ...player, PlayerId: "xuid(9999999999)" } : player,
      ),
    };
    const first = aCustomMatch("latest-1", "2026-09-01T10:00:00.000Z");
    const swapped = aSwappedMatch("latest-2", "2026-09-01T10:30:00.000Z");
    const stats = [swapped, earlierSecond, first, earlier];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(
        new Map([
          ["1111111111", "First teammate"],
          ["3333333333", "First opponent"],
        ]),
      );
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.series[0]?.matchIds).toEqual(["latest-1", "latest-2"]);
    expect(body.view.series[0]?.teams?.[0]?.players[0]?.gamertag).toBe("First teammate");
    expect(body.view.series[0]?.teams?.[1]?.players[0]?.gamertag).toBe("First opponent");
    expect(body.view.activeSeriesContext?.teams).toEqual(body.view.series[0]?.teams);
  });

  it("excludes late joiners from the anchor roster while retaining the grouped series", async () => {
    const first = aCustomMatch("series-1", "2026-09-01T10:00:00.000Z");
    const latePlayer = aFakePlayerWith({
      PlayerId: "xuid(9999999999)",
      LastTeamId: 0,
      ParticipationInfo: {
        ...Preconditions.checkExists(first.Players[0], "anchor player").ParticipationInfo,
        PresentAtBeginning: false,
      },
    });
    const stats = [
      { ...first, Players: [...first.Players, latePlayer] },
      aCustomMatch("series-2", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.series[0]?.matchIds).toEqual(["series-1", "series-2"]);
    expect(body.view.series[0]?.teams?.[0]?.players).toHaveLength(
      first.Players.filter((player) => player.LastTeamId === 0).length,
    );
  });

  it("retains separate XUIDs for unresolved series players", async () => {
    const stats = [
      aCustomMatch("series-1", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("series-2", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;
    const body = await overlayPreviewContract.fromResponse(res);
    const team = Preconditions.checkExists(body.view.series[0]?.teams?.[0], "first team");

    expect(team.players.map((player) => player.gamertag)).toEqual(["*Unknown*", "*Unknown*"]);
    expect(new Set(team.players.map((player) => player.xboxId)).size).toBe(2);
  });

  it("excludes sub-two-minute games before fetching details and computing highlights", async () => {
    const short = aCustomMatch("short", "2026-09-01T10:00:00.000Z");
    const boundary = aCustomMatch("boundary", "2026-09-01T10:30:00.000Z");
    const long = aCustomMatch("long", "2026-09-01T11:00:00.000Z");
    const stats = [
      { ...short, MatchInfo: { ...short.MatchInfo, Duration: "PT1M59.9S" } },
      { ...boundary, MatchInfo: { ...boundary.MatchInfo, Duration: "PT2M" } },
      long,
    ];
    let fetchedDetails:
      MockInstance<ReturnType<typeof installFakeServicesWith>["haloService"]["getMatchDetails"]> | undefined;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: ["total-games"] },
      });
      fetchedDetails = vi.spyOn(services.haloService, "getMatchDetails");
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(fetchedDetails).toHaveBeenCalledTimes(2);
    expect(fetchedDetails).toHaveBeenCalledWith(["boundary"]);
    expect(fetchedDetails).toHaveBeenCalledWith(["long"]);
    expect(body.view.matches.map((match) => match.matchId)).toEqual(["boundary", "long"]);
    expect(body.view.statsHighlights?.[0]?.value).toBe("2");
  });

  it("keeps other matches and highlights when one detail request fails", async () => {
    const stats = [
      aCustomMatch("unavailable", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("available", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: ["total-games"] },
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockImplementation(async (ids) => {
        if (ids.includes("unavailable")) {
          return Promise.reject(new Error("match details unavailable"));
        }
        return Promise.resolve(stats.filter((match) => ids.includes(match.MatchId)));
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(res.status).toBe(200);
    expect(body.view.matches.map((match) => match.matchId)).toEqual(["available"]);
    expect(body.view.statsHighlights?.[0]?.value).toBe("1");
  });

  it("does not swallow match-detail authentication failures", async () => {
    const stats = [
      aCustomMatch("expired", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("available", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getMatchDetails").mockImplementation(async (ids) => {
        if (ids.includes("expired")) {
          return Promise.reject(new Error("Spartan token expired"));
        }
        return Promise.resolve(stats.filter((match) => ids.includes(match.MatchId)));
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;

    expect(res.status).toBe(500);
  });

  it("keeps a preview available when playlist metadata fails", async () => {
    const base = aCustomMatch("match-1", "2026-09-01T10:00:00.000Z");
    const playlist = { AssetKind: 2, AssetId: "playlist-1", VersionId: "version-1" };
    const stats = [{ ...base, MatchInfo: { ...base.MatchInfo, Playlist: playlist } }];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getPlaylistName").mockRejectedValue(new Error("metadata unavailable"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(res.status).toBe(200);
    expect(body.view.matches[0]?.isMatchmaking).toBe(true);
    expect(body.view.matches[0]?.matchmakingPlaylist).toBeUndefined();
  });

  it("retains matches when a map thumbnail lookup fails", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getMapThumbnailUrl").mockRejectedValue(new Error("thumbnail unavailable"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(res.status).toBe(200);
    expect(body.view.matches[0]?.mapBackgroundUrl).toBe("data:,");
    expect(body.view.statsHighlights).toBeDefined();
  });

  it("propagates thumbnail authentication failures", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getMapThumbnailUrl").mockRejectedValue(new Error("Spartan token expired"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;

    expect(res.status).toBe(500);
  });

  it("does not swallow playlist authentication failures", async () => {
    const base = aCustomMatch("match-1", "2026-09-01T10:00:00.000Z");
    const stats = [
      {
        ...base,
        MatchInfo: {
          ...base.MatchInfo,
          Playlist: {
            AssetKind: 2,
            AssetId: "playlist-1",
            VersionId: "version-1",
          },
        },
      },
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withHistory(stats)({ env });
      vi.spyOn(services.haloService, "getPlaylistName").mockRejectedValue(new Error("Spartan token expired"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;

    expect(res.status).toBe(500);
  });

  it("fetches rank data only for configured rank slots and renders the rank value", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const csr = Preconditions.checkExists(getRankedArenaCsrsData().get("0000000000001"), "rank fixture");
    const rankLookup = vi
      .fn<() => Promise<Map<string, typeof csr>>>()
      .mockResolvedValue(new Map([[TRACKED_XUID, csr]]));
    let esraLookup:
      MockInstance<ReturnType<typeof installFakeServicesWith>["haloService"]["getPlayerEsra"]> | undefined;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: ["current-rank"] },
      });
      vi.spyOn(services.haloService, "getRankedArenaCsrs").mockImplementation(rankLookup);
      esraLookup = vi.spyOn(services.haloService, "getPlayerEsra");
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(rankLookup).toHaveBeenCalledWith([TRACKED_XUID]);
    expect(esraLookup).not.toHaveBeenCalled();
    expect(body.view.statsHighlights?.[0]?.value).toBe("1,451");
    expect(body.view.statsHighlights?.[0]?.rankIcon?.rankTier).toBe("Diamond");
  });

  it("preserves an authenticated user's explicitly empty highlight slots", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: [] },
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.statsHighlights).toEqual([]);
  });

  it("caps configured highlights at the tracker maximum after filtering", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: {
          statsHighlightSlots: [
            "kills",
            "deaths",
            "assists",
            "kda",
            "accuracy",
            "damage-dealt",
            "total-games",
            "current-rank",
            "esra",
            "matchmaking-games",
          ],
        },
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.view.statsHighlights).toHaveLength(INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT);
  });

  it("fetches ESRA only when selected and renders its value", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    let rankLookup:
      MockInstance<ReturnType<typeof installFakeServicesWith>["haloService"]["getRankedArenaCsrs"]> | undefined;
    let esraLookup:
      MockInstance<ReturnType<typeof installFakeServicesWith>["haloService"]["getPlayerEsra"]> | undefined;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withSession(withHistory(stats))({ env });
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: { statsHighlightSlots: ["esra"] },
      });
      rankLookup = vi.spyOn(services.haloService, "getRankedArenaCsrs");
      esraLookup = vi.spyOn(services.haloService, "getPlayerEsra").mockResolvedValue({
        esra: 1451,
        lastRankedGamePlayed: "2026-09-01T10:00:00.000Z",
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postPreviewRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(rankLookup).not.toHaveBeenCalled();
    expect(esraLookup).toHaveBeenCalledWith(TRACKED_XUID);
    expect(body.view.statsHighlights?.[0]?.value).toBe("1,451");
    expect(body.view.statsHighlights?.[0]?.rankIcon).toBeDefined();
  });

  it("rejects an invalid match timestamp rather than selecting an arbitrary series", async () => {
    const stats = [aCustomMatch("series-1", "not-a-date"), aCustomMatch("series-2", "2026-09-01T10:30:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=series"),
      env,
    )) as Response;

    expect(res.status).toBe(500);
  });

  it("rejects an unknown preview mode", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postPreviewRequest("/api/individual-tracker/overlay-preview?mode=nonsense"),
      env,
    )) as Response;

    expect(res.status).toBe(400);
  });
});
