import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeriesOverview } from "../series-overview";

describe("SeriesOverview", () => {
  it("leaves upcoming tile team color to the CSS default", () => {
    render(
      <SeriesOverview
        score="1:0"
        teams={[]}
        matches={[
          {
            id: "played-1",
            href: "#match-1",
            mapBackgroundUrl: "data:,",
            teamColorHex: "#FE3939",
            gameModeIconUrl: null,
            gameModeAlt: "Slayer",
            score: "50:42",
            subScore: null,
            mapLabel: "Live Fire",
            isUpcoming: false,
          },
          {
            id: "planned-2",
            mapBackgroundUrl: "data:,",
            gameModeIconUrl: null,
            gameModeAlt: "",
            score: null,
            subScore: null,
            mapLabel: "Oddball: Streets",
            isUpcoming: true,
          },
        ]}
      />,
    );

    const [playedMatch, upcomingMatch] = within(screen.getByRole("list", { name: "Series score tiles" })).getAllByRole(
      "listitem",
    );

    expect(playedMatch?.getAttribute("style")).toContain("--team-color: #FE3939");
    expect(upcomingMatch?.getAttribute("style")).not.toContain("--team-color");
  });
});