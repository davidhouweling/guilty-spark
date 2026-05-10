import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Services } from "../../services/types";
import { FakeAuthService } from "../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../services/live-tracker/fakes/scenario";
import {
  FakeIndividualTrackerService,
  aFakeIndividualTrackerStateWith,
} from "../../services/individual-tracker/fakes/individual-tracker.fake";
import { IndividualTrackerPublicFactory } from "../../apps/individual-tracker-public-app";

function aServicesWith(overrides: Partial<Services> = {}): Services {
  return {
    authService: new FakeAuthService({
      session: {
        authenticated: false,
      },
    }),
    liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
    individualTrackerService: new FakeIndividualTrackerService(),
    ...overrides,
  };
}

describe("/individual-tracker/:xuid public routes wiring", () => {
  it("renders offline informational state for public view variant", async () => {
    const services = aServicesWith();

    render(<IndividualTrackerPublicFactory services={services} xuid="2533274844642438" variant="view" />);

    await waitFor(() => {
      expect(screen.getByText(/currently offline/i)).toBeInTheDocument();
    });
  });

  it("renders overlay card for public overlay variant", async () => {
    const services = aServicesWith({
      individualTrackerService: new FakeIndividualTrackerService({
        activeState: aFakeIndividualTrackerStateWith({
          gamertag: "Chief",
        }),
      }),
    });

    render(<IndividualTrackerPublicFactory services={services} xuid="2533274844642438" variant="overlay" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /chief/i })).toBeInTheDocument();
    });
  });
});
