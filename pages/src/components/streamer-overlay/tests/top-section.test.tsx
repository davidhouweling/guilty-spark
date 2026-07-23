import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TeamColor } from "../../team-colors/team-colors";
import { TopSection } from "../top-section";
import styles from "../streamer-overlay.module.css";

describe("TopSection", () => {
  afterEach(() => {
    cleanup();
  });

  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  function renderTopSection({
    title,
    subtitle,
    showScore,
  }: {
    title: string | null;
    subtitle: string | null;
    showScore: boolean;
  }): HTMLDivElement {
    const { container } = render(
      <TopSection
        title={title}
        subtitle={subtitle}
        iconUrl="/server-icon.png"
        showScore={showScore}
        showTeamDetails={false}
        seriesScore="2:1"
        teamColors={teamColors}
        teamLeft={null}
        teamRight={null}
      />,
    );

    return container.firstElementChild as HTMLDivElement;
  }

  it("keeps the two-line layout when title and subtitle are both present with score", () => {
    const topSection = renderTopSection({ title: "Main Event", subtitle: "Best of 5", showScore: true });

    const classes = topSection.className.split(" ");
    expect(classes).not.toContain(styles.topSectionNoScore);
    expect(classes).not.toContain(styles.topSectionSingleMetadataLine);
    expect(classes).not.toContain(styles.topSectionNoMetadataLine);

    const iconSlot = screen.getByRole("img", { name: "Server" }).parentElement;
    expect(iconSlot).not.toBeNull();
    expect(iconSlot?.className.split(" ")).not.toContain(styles.serverIconSlotCompact);
  });

  it("uses compact icon and centered metadata row when only one metadata line exists with score", () => {
    const topSection = renderTopSection({ title: "Grand Finals", subtitle: null, showScore: true });

    expect(topSection.className.split(" ")).toContain(styles.topSectionSingleMetadataLine);

    const iconSlot = screen.getByRole("img", { name: "Server" }).parentElement;
    expect(iconSlot).not.toBeNull();
    expect(iconSlot?.className.split(" ")).toContain(styles.serverIconSlotCompact);

    const titleElement = screen.getByText("Grand Finals");
    expect(titleElement.className.split(" ")).toContain(styles.metadataSingleLine);
  });

  it("uses a single row when title and subtitle are both missing", () => {
    const topSection = renderTopSection({ title: null, subtitle: null, showScore: true });

    expect(topSection.className.split(" ")).toContain(styles.topSectionNoMetadataLine);

    const iconSlot = screen.getByRole("img", { name: "Server" }).parentElement;
    expect(iconSlot).not.toBeNull();
    expect(iconSlot?.className.split(" ")).toContain(styles.serverIconSlotCompact);
  });

  it("keeps title and subtitle on a second row when score is hidden", () => {
    const topSection = renderTopSection({ title: "Championship", subtitle: "Upper Bracket", showScore: false });

    const classes = topSection.className.split(" ");
    expect(classes).toContain(styles.topSectionNoScore);
    expect(classes).not.toContain(styles.topSectionSingleMetadataLine);

    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("stacks icon over metadata when score is hidden and only one metadata line exists", () => {
    const topSection = renderTopSection({ title: null, subtitle: "Losers Round 3", showScore: false });

    const classes = topSection.className.split(" ");
    expect(classes).toContain(styles.topSectionNoScore);
    expect(classes).toContain(styles.topSectionSingleMetadataLine);

    const iconSlot = screen.getByRole("img", { name: "Server" }).parentElement;
    expect(iconSlot).not.toBeNull();

    const iconSlotClasses = iconSlot?.className.split(" ") ?? [];
    expect(iconSlotClasses).toContain(styles.serverIconSlotCompact);
    expect(iconSlotClasses).toContain(styles.serverIconSlotCentered);

    const subtitleElement = screen.getByText("Losers Round 3");
    expect(subtitleElement.className.split(" ")).toContain(styles.metadataSingleLine);
  });
});
