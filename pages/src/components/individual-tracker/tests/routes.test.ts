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
    expect(buildIndividualTrackerTrackerViewPath("abc-123")).toBe("/individual-tracker/abc-123");
  });

  it("percent-encodes special characters in the tracker id", () => {
    expect(buildIndividualTrackerTrackerViewPath("id with spaces")).toBe("/individual-tracker/id%20with%20spaces");
  });
});

describe("buildIndividualTrackerPublicViewPath", () => {
  it("returns the /u/<gamertag>/view path", () => {
    expect(buildIndividualTrackerPublicViewPath("SpartanOne")).toBe("/u/SpartanOne/view");
  });

  it("percent-encodes special characters in the gamertag", () => {
    expect(buildIndividualTrackerPublicViewPath("Spartan One")).toBe("/u/Spartan%20One/view");
  });
});

describe("buildIndividualTrackerPublicOverlayPath", () => {
  it("returns the /u/<gamertag>/overlay path", () => {
    expect(buildIndividualTrackerPublicOverlayPath("SpartanOne")).toBe("/u/SpartanOne/overlay");
  });

  it("percent-encodes special characters in the gamertag", () => {
    expect(buildIndividualTrackerPublicOverlayPath("Spartan One")).toBe("/u/Spartan%20One/overlay");
  });
});
