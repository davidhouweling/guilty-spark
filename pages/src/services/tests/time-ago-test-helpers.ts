import { expect } from "vitest";

export async function expectTimeAgoLocaleRegistered(): Promise<void> {
  const { default: TimeAgo } = await import("javascript-time-ago");

  expect(() => new TimeAgo("en").format(new Date())).not.toThrow();
}
