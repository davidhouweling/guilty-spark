import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Heading } from "../heading";
import styles from "../heading.module.css";

describe("Heading", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the given semantic tag with the provided text", () => {
    render(<Heading tagName="h3">Section title</Heading>);

    const heading = screen.getByRole("heading", { level: 3, name: "Section title" });
    expect(heading.tagName).toBe("H3");
  });

  it("applies the plain variant by default", () => {
    render(<Heading tagName="h2">Plain title</Heading>);

    const heading = screen.getByRole("heading", { name: "Plain title" });
    expect(heading.className.split(" ")).not.toContain(styles.display);
  });

  it("applies the display variant when requested", () => {
    render(
      <Heading tagName="h1" variant="display">
        Display title
      </Heading>,
    );

    const heading = screen.getByRole("heading", { name: "Display title" });
    expect(heading.className.split(" ")).toContain(styles.display);
  });

  it("sets a heading-spacing CSS variable from the space scale when spacing is provided", () => {
    render(
      <Heading tagName="h2" spacing={4}>
        Spaced title
      </Heading>,
    );

    const heading = screen.getByRole("heading", { name: "Spaced title" });
    expect(heading.style.getPropertyValue("--heading-spacing")).toBe("var(--space-4)");
  });

  it("omits the heading-spacing CSS variable when spacing is not provided", () => {
    render(<Heading tagName="h2">Unspaced title</Heading>);

    const heading = screen.getByRole("heading", { name: "Unspaced title" });
    expect(heading.style.getPropertyValue("--heading-spacing")).toBe("");
  });

  it("renders the given semantic tag but sizes it as a different tag when styleAs is provided", () => {
    render(
      <Heading tagName="h3" styleAs="h5">
        Styled title
      </Heading>,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Styled title" });
    const classes = heading.className.split(" ");
    expect(classes).toContain(styles.h5);
    expect(classes).not.toContain(styles.h3);
  });

  it("merges a consumer-provided className alongside the base heading classes", () => {
    render(
      <Heading tagName="h4" className="custom-class">
        Custom title
      </Heading>,
    );

    const heading = screen.getByRole("heading", { name: "Custom title" });
    expect(heading.className).toContain("custom-class");
  });
});
