import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveNeatQueueSeriesSectionView } from "../live-neatqueue-series";
import type { SeriesCard } from "../types";

afterEach(() => {
  cleanup();
});

function aSeriesCardWith(overrides: Partial<SeriesCard> = {}): SeriesCard {
  return {
    guildId: "guild-1",
    queueNumber: 5,
    title: "Test Server",
    subtitle: "Queue #5",
    guildIconUrl: null,
    teamNames: ["Eagle", "Cobra"],
    busy: false,
    ...overrides,
  };
}

describe("LiveNeatQueueSeriesSectionView", () => {
  it("renders a loading message when there are no cards yet", () => {
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading
        cards={[]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByText("Loading active series…")).toBeInTheDocument();
  });

  it("renders an empty message when there are no active series and not loading", () => {
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByText("No active NeatQueue series right now.")).toBeInTheDocument();
  });

  it("renders a series card with title, subtitle, and team names", () => {
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[aSeriesCardWith()]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByText("Test Server")).toBeInTheDocument();
    expect(screen.getByText("Queue #5")).toBeInTheDocument();
    expect(screen.getByText("Eagle vs Cobra")).toBeInTheDocument();
  });

  it("renders the error message when present", () => {
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage="Failed to load active series."
        loading={false}
        cards={[]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByText("Failed to load active series.")).toBeInTheDocument();
  });

  it("calls onTrack when Track is clicked", async () => {
    const onTrack = vi.fn<(card: SeriesCard) => void>();
    const card = aSeriesCardWith();
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[card]}
        onRefresh={() => undefined}
        onTrack={onTrack}
        onGoLive={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Track" }));

    expect(onTrack).toHaveBeenCalledWith(card);
  });

  it("calls onGoLive when Live is clicked", async () => {
    const onGoLive = vi.fn<(card: SeriesCard) => void>();
    const card = aSeriesCardWith();
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[card]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={onGoLive}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(onGoLive).toHaveBeenCalledWith(card);
  });

  it("disables Track and Live buttons while the card is busy", () => {
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[aSeriesCardWith({ busy: true })]}
        onRefresh={() => undefined}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Track" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
  });

  it("calls onRefresh when Refresh is clicked", async () => {
    const onRefresh = vi.fn<() => void>();
    render(
      <LiveNeatQueueSeriesSectionView
        errorMessage={null}
        loading={false}
        cards={[]}
        onRefresh={onRefresh}
        onTrack={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
