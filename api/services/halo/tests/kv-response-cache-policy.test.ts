import { describe, expect, it } from "vitest";
import { getKvCacheSkipReason, isImmutableHaloResource } from "../kv-response-cache-policy";
import { aFakeResponseWith } from "../fakes/resilient-fetch.fake";

const MATCH_STATS_URL = "https://halostats.svc.halowaypoint.com/hi/matches/abc-123/stats";
const MAP_VERSION_URL = "https://discovery-infiniteugc.svc.halowaypoint.com/hi/maps/map-id/versions/version-id";
const VARIANT_VERSION_URL =
  "https://discovery-infiniteugc.svc.halowaypoint.com/hi/ugcGameVariants/variant-id/versions/version-id";
const MATCH_HISTORY_URL = "https://halostats.svc.halowaypoint.com/hi/players/xuid(1)/matches";

describe("isImmutableHaloResource", () => {
  it.each([MATCH_STATS_URL, MAP_VERSION_URL, VARIANT_VERSION_URL])("returns true for %s", (url) => {
    expect(isImmutableHaloResource(url)).toBe(true);
  });

  it.each([
    MATCH_HISTORY_URL,
    "https://skill.svc.halowaypoint.com/hi/matches/abc-123/skill",
    "https://discovery-infiniteugc.svc.halowaypoint.com/hi/maps/map-id",
    "not a url",
  ])("returns false for %s", (url) => {
    expect(isImmutableHaloResource(url)).toBe(false);
  });
});

describe("getKvCacheSkipReason", () => {
  it("returns null for a cacheable json response", () => {
    const response = aFakeResponseWith({ headers: { "content-type": "application/json" } });

    expect(getKvCacheSkipReason(MATCH_HISTORY_URL, response)).toBeNull();
  });

  it("returns the status for non-200 responses", () => {
    const response = aFakeResponseWith({ status: 404, headers: { "content-type": "application/json" } });

    expect(getKvCacheSkipReason(MATCH_STATS_URL, response)).toBe("status 404");
  });

  it("returns the content type for non-json responses", () => {
    const response = aFakeResponseWith({ headers: { "content-type": "text/html" } });

    expect(getKvCacheSkipReason(MATCH_STATS_URL, response)).toBe("content-type text/html");
  });

  it("reports a missing content type", () => {
    const response = aFakeResponseWith();

    expect(getKvCacheSkipReason(MATCH_STATS_URL, response)).toBe("content-type missing");
  });

  it("returns the cache-control for private responses on mutable resources", () => {
    const response = aFakeResponseWith({
      headers: { "content-type": "application/json", "cache-control": "private, max-age=60" },
    });

    expect(getKvCacheSkipReason(MATCH_HISTORY_URL, response)).toBe("cache-control private, max-age=60");
  });

  it("ignores private and no-store cache-control for immutable resources", () => {
    const privateResponse = aFakeResponseWith({
      headers: { "content-type": "application/json", "cache-control": "private" },
    });
    const noStoreResponse = aFakeResponseWith({
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

    expect(getKvCacheSkipReason(MATCH_STATS_URL, privateResponse)).toBeNull();
    expect(getKvCacheSkipReason(MAP_VERSION_URL, noStoreResponse)).toBeNull();
  });
});
