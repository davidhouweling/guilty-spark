import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { TrackerWebSocketDemo } from "../../components/live-tracker/create";

describe("/tracker page wiring", () => {
  it("boots the tracker island via the services installer", async () => {
    window.history.pushState({}, "", "/tracker?server=1&queue=3");

    render(<TrackerWebSocketDemo apiHost="http://example.local" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sample\s*Guild/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Queue\s*#\s*\d+/i)).toBeInTheDocument();
    expect(screen.getByText(/Status/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Series overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Waiting for first match to complete/i)).toBeInTheDocument();
  });
});
