import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { StreamerSettings } from "../streamer-settings";

const noopSave = (): void => undefined;

function renderSettings(
  settings: StreamerViewSettings = {},
  saving = false,
  errorMessage: string | null = null,
  onSave: (s: StreamerViewSettings) => void = noopSave,
): void {
  render(<StreamerSettings settings={settings} saving={saving} errorMessage={errorMessage} onSave={onSave} />);
}

afterEach(() => {
  cleanup();
});

describe("StreamerSettings", () => {
  describe("initial render with defaults", () => {
    it("renders the colour mode radio group with player selected by default", () => {
      renderSettings();

      const playerRadio = screen.getByRole("radio", { name: /player/i });
      const observerRadio = screen.getByRole("radio", { name: /observer/i });

      expect(playerRadio).toBeChecked();
      expect(observerRadio).not.toBeChecked();
    });

    it("renders the visible section checkboxes with default values", () => {
      renderSettings();

      expect(screen.getByRole("checkbox", { name: /show tabs/i })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show ticker/i })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show team details/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show title/i })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show subtitle/i })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show score/i })).toBeChecked();
    });

    it("renders player colour pickers", () => {
      renderSettings();

      expect(screen.getByLabelText(/select your team colour/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select enemy colour/i)).toBeInTheDocument();
    });

    it("does not render observer colour pickers in player mode", () => {
      renderSettings();

      expect(screen.queryByLabelText(/select observer team colour/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/select observer enemy colour/i)).not.toBeInTheDocument();
    });

    it("renders observer colour pickers when colour mode is observer", () => {
      renderSettings({ styleFlags: { colorMode: "observer" } });

      expect(screen.getByLabelText(/select observer team colour/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select observer enemy colour/i)).toBeInTheDocument();
    });

    it("renders the Save button", () => {
      renderSettings();

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });
  });

  describe("save interaction", () => {
    it("calls onSave with the correct settings when the form is submitted", async () => {
      expect.assertions(4);
      const user = userEvent.setup();
      let savedSettings: StreamerViewSettings | undefined;
      const onSave = (s: StreamerViewSettings): void => {
        savedSettings = s;
      };

      renderSettings({}, false, null, onSave);

      await user.click(screen.getByRole("button", { name: /save/i }));

      if (savedSettings !== undefined) {
        expect(savedSettings.styleFlags?.colorMode).toBe("player");
        expect(savedSettings.visibleSections?.showTabs).toBe(true);
        expect(savedSettings.visibleSections?.showTeamDetails).toBe(false);
      }
      expect(savedSettings).toBeDefined();
    });

    it("calls onSave with updated checkbox state when a checkbox is toggled", async () => {
      expect.assertions(2);
      const user = userEvent.setup();
      let savedSettings: StreamerViewSettings | undefined;
      const onSave = (s: StreamerViewSettings): void => {
        savedSettings = s;
      };

      renderSettings({}, false, null, onSave);

      await user.click(screen.getByRole("checkbox", { name: /show tabs/i }));
      await user.click(screen.getByRole("button", { name: /save/i }));

      if (savedSettings !== undefined) {
        expect(savedSettings.visibleSections?.showTabs).toBe(false);
      }
      expect(savedSettings).toBeDefined();
    });

    it("calls onSave with observer colour mode when observer radio is selected", async () => {
      expect.assertions(2);
      const user = userEvent.setup();
      let savedSettings: StreamerViewSettings | undefined;
      const onSave = (s: StreamerViewSettings): void => {
        savedSettings = s;
      };

      renderSettings({}, false, null, onSave);

      await user.click(screen.getByRole("radio", { name: /observer/i }));
      await user.click(screen.getByRole("button", { name: /save/i }));

      if (savedSettings !== undefined) {
        expect(savedSettings.styleFlags?.colorMode).toBe("observer");
      }
      expect(savedSettings).toBeDefined();
    });
  });

  describe("saving state", () => {
    it("disables the Save button when saving is true", () => {
      renderSettings({}, true);

      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
  });

  describe("error message", () => {
    it("shows the error message when errorMessage is provided", () => {
      renderSettings({}, false, "Failed to save settings");

      expect(screen.getByText("Failed to save settings")).toBeInTheDocument();
    });

    it("does not show an error message when errorMessage is null", () => {
      renderSettings({}, false, null);

      expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });
  });

  describe("initial values from settings prop", () => {
    it("pre-selects observer colour mode from settings", () => {
      renderSettings({ styleFlags: { colorMode: "observer" } });

      expect(screen.getByRole("radio", { name: /observer/i })).toBeChecked();
    });

    it("reflects custom visible section settings", () => {
      renderSettings({
        visibleSections: {
          showTabs: false,
          showScore: false,
          showTeamDetails: true,
        },
      });

      expect(screen.getByRole("checkbox", { name: /show tabs/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show score/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /show team details/i })).toBeChecked();
    });
  });
});
