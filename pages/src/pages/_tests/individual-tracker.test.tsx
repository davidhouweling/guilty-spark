import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Services } from "../../services/types";
import { FakeAuthService } from "../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../services/live-tracker/fakes/scenario";
import { FakeIndividualTrackerService } from "../../services/individual-tracker/fakes/individual-tracker.fake";
import { IndividualTrackerFactory } from "../../apps/individual-tracker-app";

describe("/individual-tracker page wiring", () => {
  it("renders individual tracker settings shell for authenticated users", async () => {
    const services: Services = {
      authService: new FakeAuthService({
        session: {
          authenticated: true,
          userId: "user-1",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: new FakeIndividualTrackerService(),
    };

    render(<IndividualTrackerFactory services={services} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /individual tracker/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /live trackers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /streamer settings/i })).toBeInTheDocument();
  });
});
