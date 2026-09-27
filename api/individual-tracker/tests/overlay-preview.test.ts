import { RequestError } from "halo-infinite-api";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { describe, expect, it, vi } from "vitest";
import { aFakeMatchStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeHaloServiceWith } from "../../services/halo/fakes/halo.fake";
import { getPlayerMatches } from "../../services/halo/fakes/data";
import { aFakeLogServiceWith } from "../../services/log/fakes/log.fake";
import { buildOverlayPreviewView } from "../overlay-preview";

const TRACKED_XUID = "1111111111";

function aCustomMatch(matchId: string, startTime: string): MatchStats {
  const base = aFakeMatchStatsWith({ MatchId: matchId });
  return {
    ...base,
    MatchInfo: {
      ...base.MatchInfo,
      StartTime: startTime,
      EndTime: startTime,
      Duration: "PT10M",
      Playlist: null,
    },
  };
}

function aPlayerMatch(stats: MatchStats): PlayerMatchHistory {
  const template = getPlayerMatches().at(0);
  if (template === undefined) {
    throw new Error("Expected a player-match fixture");
  }
  return { ...template, MatchId: stats.MatchId, MatchInfo: stats.MatchInfo };
}

function aPreviewService(stats: readonly MatchStats[]) {
  const haloService = aFakeHaloServiceWith();
  vi.spyOn(haloService, "getPlayerMatches").mockResolvedValue(stats.map(aPlayerMatch));
  vi.spyOn(haloService, "getMatchDetails").mockImplementation(async (matchIds) =>
    Promise.resolve(stats.filter((match) => matchIds.includes(match.MatchId))),
  );
  vi.spyOn(haloService, "getGameTypeAndMapParts").mockResolvedValue({ gameType: "Slayer", gameMap: "Aquarius" });
  vi.spyOn(haloService, "getMapThumbnailUrl").mockResolvedValue("https://example.com/map.jpg");
  vi.spyOn(haloService, "getPlayerXuidsToGametags").mockResolvedValue(
    new Map([
      ["1111111111", "ChiefSpartan"],
      ["3333333333", "Opponent"],
    ]),
  );
  vi.spyOn(haloService, "getSeriesScore").mockReturnValue("2:0");
  return haloService;
}

function buildPreview(
  haloService: ReturnType<typeof aFakeHaloServiceWith>,
  mode: "matchmaking" | "series",
): Promise<Awaited<ReturnType<typeof buildOverlayPreviewView>>> {
  return buildOverlayPreviewView({
    haloService,
    logService: aFakeLogServiceWith(),
    xuid: TRACKED_XUID,
    gamertag: "ChiefSpartan",
    mode,
    statsHighlightSlots: ["total-games"],
  });
}

describe("buildOverlayPreviewView", () => {
  it("builds matchmaking summaries and highlights from enriched history", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const haloService = aPreviewService(stats);

    const view = await buildPreview(haloService, "matchmaking");

    expect(view.hasActiveSeries).toBe(false);
    expect(view.matches.map((match) => match.matchId)).toEqual(["match-1"]);
    expect(view.matches[0]?.mapName).toBe("Aquarius");
    expect(view.matches[0]?.mapBackgroundUrl).toBe("https://example.com/map.jpg");
    expect(view.statsHighlights?.[0]?.value).toBe("1");
    expect(view.series).toEqual([]);
  });

  it("groups custom matches into a series and supplies matching active context", async () => {
    const stats = [
      aCustomMatch("series-1", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("series-2", "2026-09-01T10:30:00.000Z"),
    ];
    const haloService = aPreviewService(stats);

    const view = await buildPreview(haloService, "series");

    expect(view.hasActiveSeries).toBe(true);
    expect(view.series[0]?.matchIds).toEqual(["series-1", "series-2"]);
    expect(view.activeSeriesContext?.title).toBe(view.series[0]?.title);
    expect(view.activeSeriesContext?.subtitle).toBe(view.series[0]?.subtitle);
  });

  it("skips individual non-auth match-detail failures but propagates auth failures", async () => {
    const stats = [
      aCustomMatch("match-fails", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("match-works", "2026-09-01T10:30:00.000Z"),
    ];
    const successfulMatch = Preconditions.checkExists(stats.at(1), "successful match fixture");
    const haloService = aPreviewService(stats);
    vi.spyOn(haloService, "getMatchDetails").mockImplementation(async (matchIds) => {
      if (matchIds[0] === "match-fails") {
        throw new Error("temporary Halo failure");
      }
      return Promise.resolve([successfulMatch]);
    });

    const view = await buildPreview(haloService, "matchmaking");

    expect(view.matches.map((match) => match.matchId)).toEqual(["match-works"]);

    vi.spyOn(haloService, "getMatchDetails").mockRejectedValue(
      new RequestError(new URL("https://halo"), new Response(null, { status: 401 })),
    );

    await expect(buildPreview(haloService, "matchmaking")).rejects.toThrow();
  });
});
