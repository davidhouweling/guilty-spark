import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { installFakeServices } from "../../../services/install.fake";
import type { installServices } from "../../../services/install";

const { installServicesMock } = vi.hoisted(() => ({
  installServicesMock: vi.fn<typeof installServices>(),
}));

vi.mock("../../../services/install", () => ({
  installServices: installServicesMock,
}));

vi.mock("../../../components/individual-tracker/individual-tracker", () => ({
  IndividualTrackerView: (): React.ReactElement => <div>Individual tracker view</div>,
}));

import { IndividualTrackerApp, IndividualTrackerFactory } from "../../../apps/individual-tracker-app";

afterEach(() => {
  cleanup();
});

describe("IndividualTracker create", () => {
  it("renders view from factory", async () => {
    const services = await installFakeServices();

    render(<IndividualTrackerFactory services={services} />);

    expect(screen.getByText("Individual tracker view")).toBeInTheDocument();
  });

  it("installs services and renders view", async () => {
    window.history.pushState({}, "", "/individual-tracker");

    const services = await installFakeServices();
    installServicesMock.mockResolvedValue(services);

    render(<IndividualTrackerApp apiHost="https://api.example.com" />);

    expect(screen.getByText("Loading individual tracker...")).toBeInTheDocument();

    await waitFor(() => {
      expect(installServicesMock).toHaveBeenCalledWith("https://api.example.com");
    });

    await waitFor(() => {
      expect(screen.getByText("Individual tracker view")).toBeInTheDocument();
    });
  });
});
