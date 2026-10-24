import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FlagRunMarker } from "../flag-run-marker";

afterEach(() => {
  cleanup();
});

describe("FlagRunMarker", () => {
  it("renders a filled circle for a steal and a hollow circle for a pickup", () => {
    const { container: steal } = render(
      <svg>
        <FlagRunMarker kind="steal" color="#ff0000" cx={10} cy={10} />
      </svg>,
    );
    const { container: grab } = render(
      <svg>
        <FlagRunMarker kind="grab" color="#ff0000" cx={10} cy={10} />
      </svg>,
    );
    expect(steal.querySelector("circle")?.getAttribute("fill")).toBe("#ff0000");
    expect(grab.querySelector("circle")?.getAttribute("stroke")).toBe("#ff0000");
    expect(grab.querySelector("circle")?.getAttribute("fill")).not.toBe("#ff0000");
  });

  it("renders paths for carrier kills, returns and captures in the run colour", () => {
    expect.assertions(3);
    for (const kind of ["drop", "return", "capture"] as const) {
      const { container } = render(
        <svg>
          <FlagRunMarker kind={kind} color="#00ff00" cx={5} cy={5} />
        </svg>,
      );
      const path = container.querySelector("path");
      expect(path?.getAttribute(kind === "drop" ? "stroke" : "fill")).toBe("#00ff00");
    }
  });
});
