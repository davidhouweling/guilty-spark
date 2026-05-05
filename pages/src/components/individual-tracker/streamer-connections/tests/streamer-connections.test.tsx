import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamerConnectionsSectionView } from "../streamer-connections";

describe("StreamerConnectionsSectionView", () => {
  it("shows warning when no xbox xuid is available", () => {
    render(<StreamerConnectionsSectionView xboxXuid={null} />);

    expect(screen.getByText(/no active xbox identity is linked/i)).toBeInTheDocument();
  });

  it("renders stable xuid viewer and overlay urls", () => {
    render(<StreamerConnectionsSectionView xboxXuid="2533274844642438" />);

    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/view/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/overlay/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
  });
});
