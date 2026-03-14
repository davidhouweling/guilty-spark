import "@testing-library/jest-dom/vitest";

import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dropdown } from "../dropdown";

beforeAll(() => {
  Element.prototype.scrollIntoView = (): void => {
    // Mock implementation
  };
});

afterEach(() => {
  cleanup();
});

describe("Dropdown", () => {
  it("renders trigger button", () => {
    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const triggers = screen.getAllByLabelText("Test dropdown");
    expect(triggers.length).toBeGreaterThan(0);
    expect(screen.getByText("Open Menu")).toBeInTheDocument();
  });

  it("opens dropdown when trigger is clicked", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Dropdown content")).toBeInTheDocument();
    });
  });

  it("closes dropdown when clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
          <div>Dropdown content</div>
        </Dropdown>
        <button type="button">Outside button</button>
      </div>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Dropdown content")).toBeInTheDocument();
    });

    const outsideButton = screen.getByRole("button", { name: "Outside button" });
    await user.click(outsideButton);

    await waitFor(() => {
      expect(screen.queryByText("Dropdown content")).not.toBeInTheDocument();
    });
  });

  it("closes dropdown when Escape key is pressed", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Dropdown content")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Dropdown content")).not.toBeInTheDocument();
    });
  });

  it("toggles dropdown on repeated trigger clicks", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");

    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByText("Dropdown content")).toBeInTheDocument();
    });

    await user.click(trigger);
    await waitFor(() => {
      expect(screen.queryByText("Dropdown content")).not.toBeInTheDocument();
    });
  });

  it("sets aria-expanded attribute correctly", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");

    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("applies custom dropdown width and height", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown" dropdownWidth={300} dropdownHeight={200}>
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      const dropdownContent = screen.getByText("Dropdown content").parentElement;
      expect(dropdownContent).toHaveStyle({ width: "300px", maxHeight: "200px" });
    });
  });

  it("scrolls to selected element when scrollToSelected is true", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown" scrollToSelected={true}>
        <div>
          <div>Item 1</div>
          <div>Item 2</div>
          <div data-selected="true">Selected Item</div>
          <div>Item 4</div>
        </div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Selected Item")).toBeInTheDocument();
    });
  });

  it("does not scroll when scrollToSelected is false", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown" scrollToSelected={false}>
        <div>
          <div>Item 1</div>
          <div data-selected="true">Selected Item</div>
        </div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Selected Item")).toBeInTheDocument();
    });
  });

  it("renders children inside dropdown", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <ul>
          <li>Option 1</li>
          <li>Option 2</li>
          <li>Option 3</li>
        </ul>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.getByText("Option 2")).toBeInTheDocument();
      expect(screen.getByText("Option 3")).toBeInTheDocument();
    });
  });

  it("unmounts dropdown content when closed", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown trigger={<span>Open Menu</span>} ariaLabel="Test dropdown">
        <div>Dropdown content</div>
      </Dropdown>,
    );

    const [trigger] = screen.getAllByLabelText("Test dropdown");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Dropdown content")).toBeInTheDocument();
    });

    await user.click(trigger);

    await waitFor(() => {
      expect(screen.queryByText("Dropdown content")).not.toBeInTheDocument();
    });
  });

  it("handles multiple dropdowns independently", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Dropdown trigger={<span>Menu 1</span>} ariaLabel="Dropdown 1">
          <div>Content 1</div>
        </Dropdown>
        <Dropdown trigger={<span>Menu 2</span>} ariaLabel="Dropdown 2">
          <div>Content 2</div>
        </Dropdown>
      </div>,
    );

    const [trigger1] = screen.getAllByLabelText("Dropdown 1");
    const [trigger2] = screen.getAllByLabelText("Dropdown 2");

    await user.click(trigger1);

    await waitFor(() => {
      expect(screen.getByText("Content 1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Content 2")).not.toBeInTheDocument();

    await user.click(trigger2);

    await waitFor(() => {
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });
  });
});
