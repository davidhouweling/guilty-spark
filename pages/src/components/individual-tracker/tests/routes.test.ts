import { describe, expect, it } from "vitest";
import {
  buildIndividualTrackerActiveViewPath,
  buildIndividualTrackerManagePath,
  buildIndividualTrackerPublicOverlayPath,
  buildIndividualTrackerPublicViewPath,
  buildIndividualTrackerTrackerViewPath,
} from "../routes";

describe("buildIndividualTrackerManagePath", () => {
  it("returns the root path", () => {
    expect(buildIndividualTrackerManagePath()).toBe("/");
  });
});

describe("buildIndividualTrackerActiveViewPath", () => {
  it("returns the active view path", () => {
    expect(buildIndividualTrackerActiveViewPath()).toBe("/active");
  });
});

describe("buildIndividualTrackerTrackerViewPath", () => {
  it("encodes the tracker id into the path", () => {
    expect(buildIndividualTrackerTrackerViewPath("abc-123")).toBe("/tracker/abc-123");
  });

  it("percent-encodes special characters in the tracker id", () => {
    expect(buildIndividualTrackerTrackerViewPath("id with spaces")).toBe("/tracker/id%20with%20spaces");
  });
});

describe("buildIndividualTrackerPublicViewPath", () => {
  it("encodes the xuid into the view path", () => {
    expect(buildIndividualTrackerPublicViewPath("xuid(123456)")).toBe("/xuid(123456)/view");
  });
});

describe("buildIndividualTrackerPublicOverlayPath", () => {
  it("encodes the xuid into the overlay path", () => {
    expect(buildIndividualTrackerPublicOverlayPath("xuid(123456)")).toBe("/xuid(123456)/overlay");
  });
});
