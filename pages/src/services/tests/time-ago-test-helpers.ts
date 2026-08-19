import type { MockInstance } from "vitest";
import { expect, vi } from "vitest";
import TimeAgo from "javascript-time-ago";

/**
 * `javascript-time-ago` keeps locale registration in module-level state that
 * Vitest's dependency pre-bundling does not reset between tests, so asserting
 * on the resulting behaviour (e.g. `timeAgo.format()` not throwing) can pass
 * even when the module under test no longer registers the locale itself, if
 * an earlier test already registered it. Spying on `TimeAgo.addLocale` checks
 * that *this* import actually triggered registration, independent of any
 * prior test's side effects. Call `vi.resetModules()` before this so the
 * source module under test re-executes and re-triggers the spy.
 */
export function spyOnTimeAgoAddLocale(): MockInstance<typeof TimeAgo.addLocale> {
  return vi.spyOn(TimeAgo, "addLocale");
}

export function expectTimeAgoLocaleRegistered(addLocaleSpy: MockInstance<typeof TimeAgo.addLocale>): void {
  expect(addLocaleSpy).toHaveBeenCalled();
}
