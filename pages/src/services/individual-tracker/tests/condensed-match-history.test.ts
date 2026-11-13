import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealCondensedMatchHistoryService } from "../condensed-match-history";
import type { CondensedMatchHistoryService } from "../condensed-match-history-types";
import {
  aFakeCondensedMatchHistoryEntryWith,
  aFakeCondensedMatchHistoryServiceWith,
} from "../fakes/condensed-match-history.fake";
import { installCondensedMatchHistoryService } from "../install-condensed-match-history";

describe("condensed match history", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: CondensedMatchHistoryService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealCondensedMatchHistoryService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requests a bounded custom page with credentials and an encoded owner selector", async () => {
    const match = aFakeCondensedMatchHistoryEntryWith();
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({ matches: [match], suggestedGroupings: [["a", "b"]] }),
    );

    const page = await service.getMatchHistory({
      xuid: "123",
      start: 25,
      count: 10,
      category: "custom",
      gamertag: "Player + One",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/search/123/matches?start=25&count=10&category=custom&gamertag=Player+%2B+One",
      { credentials: "include" },
    );
    expect(page.suggestedGroupings).toEqual([["a", "b"]]);
    expect(page.matches[0]).toMatchObject({
      ...match,
      duration: "10m",
      scoreDisplay: "50:42",
      resultString: "Win - 50:42",
    });
    expect(page.matches[0]).not.toHaveProperty("rawMatchStats");
  });

  it("defaults to all categories, omits the selector and preserves an empty page", async () => {
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({ matches: [], suggestedGroupings: [] }),
    );
    await expect(service.getMatchHistory({ xuid: "123", start: 0, count: 25 })).resolves.toEqual({
      matches: [],
      suggestedGroupings: [],
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/search/123/matches?start=0&count=25&category=all",
      { credentials: "include" },
    );
  });

  it.each([
    { matches: [] },
    {
      matches: [{ ...aFakeCondensedMatchHistoryEntryWith(), score: { scores: ["50"], roundsWon: null } }],
      suggestedGroupings: [],
    },
    {
      matches: [{ ...aFakeCondensedMatchHistoryEntryWith(), highlightContribution: undefined }],
      suggestedGroupings: [],
    },
  ])("rejects malformed or incomplete condensed responses", async (response) => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));
    await expect(service.getMatchHistory({ xuid: "123", start: 0, count: 25 })).rejects.toThrow();
  });

  it("rejects an HTTP failure even if its body resembles a valid page", async () => {
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({ matches: [], suggestedGroupings: [] }, { status: 503 }),
    );
    await expect(service.getMatchHistory({ xuid: "123", start: 0, count: 25 })).rejects.toThrow(
      "Failed to fetch match history (503)",
    );
  });

  it("keeps unavailable details null and zero numeric contributions intact", async () => {
    const missing = aFakeCondensedMatchHistoryEntryWith({
      score: null,
      teamCount: null,
      teamRosterSignature: null,
      trackedPlayerSummary: null,
      highlightContribution: null,
      teams: [],
      outcome: "Unknown",
    });
    const zero = aFakeCondensedMatchHistoryEntryWith({
      matchId: "zero",
      score: { scores: [0, 0], roundsWon: [0, 0] },
      trackedPlayerSummary: { kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0 },
    });
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({ matches: [missing, zero], suggestedGroupings: [] }),
    );
    const page = await service.getMatchHistory({ xuid: "123", start: 0, count: 25 });

    expect(page.matches[0]).toMatchObject({ ...missing, scoreDisplay: null, resultString: "Unknown" });
    expect(page.matches[1]).toMatchObject({
      ...zero,
      scoreDisplay: "0:0 (0:0)",
      resultString: "Win - 0:0",
    });
  });

  it("formats ISO times in the browser locale/timezone and numbers in the browser locale", async () => {
    const { DateTimeFormat } = Intl;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new DateTimeFormat(locales ?? "de-DE", { ...options, timeZone: "America/Los_Angeles" });
    });
    vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales, options) {
      return new Intl.NumberFormat(locales ?? "de-DE", options).format(this);
    });
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({
        matches: [
          aFakeCondensedMatchHistoryEntryWith({
            durationIso: "PT10M5S",
            score: { scores: [1234, 1000], roundsWon: [2, 1] },
          }),
        ],
        suggestedGroupings: [],
      }),
    );

    const page = await service.getMatchHistory({ xuid: "123", start: 0, count: 25 });

    expect(page.matches[0]).toMatchObject({
      startTime: "1.1.2026, 5:00:00 PM",
      endTime: "1.1.2026, 5:10:00 PM",
      duration: "10m 5s",
      scoreDisplay: "2:1 (1.234:1.000)",
      resultString: "Win - 1.234:1.000",
    });
  });

  it("installs the real API client in production mode", async () => {
    vi.stubEnv("MODE", "production");
    fetchSpy.mockResolvedValueOnce(
      condensedMatchHistoryPageContract.toResponse({ matches: [], suggestedGroupings: [] }),
    );
    service = await installCondensedMatchHistoryService("https://api.example.com");
    await expect(service.getMatchHistory({ xuid: "123", start: 0, count: 25 })).resolves.toEqual({
      matches: [],
      suggestedGroupings: [],
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it.each(["fake", "test"])("installs a prepared offline client in %s mode", async (mode) => {
    vi.stubEnv("MODE", mode);
    service = await installCondensedMatchHistoryService("https://api.example.com");
    const page = await service.getMatchHistory({ xuid: "123", start: 0, count: 25 });
    expect(page.matches[0]).toMatchObject({
      matchId: "history-match-1",
      scoreDisplay: "50:42",
      duration: "10m",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("supports typed fake overrides, filtered pagination, groupings and empty subsequent pages", async () => {
    service = aFakeCondensedMatchHistoryServiceWith({
      matches: [
        aFakeCondensedMatchHistoryEntryWith({ matchId: "matchmade", category: "matchmaking" }),
        aFakeCondensedMatchHistoryEntryWith({ matchId: "a" }),
        aFakeCondensedMatchHistoryEntryWith({ matchId: "b" }),
        aFakeCondensedMatchHistoryEntryWith({ matchId: "c" }),
      ],
      suggestedGroupings: [["a", "b", "c"]],
    });
    const page = await service.getMatchHistory({ xuid: "123", start: 1, count: 2, category: "custom" });
    expect(page.matches.map((match) => match.matchId)).toEqual(["b", "c"]);
    expect(page.suggestedGroupings).toEqual([["b", "c"]]);
    await expect(service.getMatchHistory({ xuid: "123", start: 4, count: 25 })).resolves.toEqual({
      matches: [],
      suggestedGroupings: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
