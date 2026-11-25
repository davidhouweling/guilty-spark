import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { DisplaySettingsSection } from "../display-settings-section";
import { DEFAULT_GLOBAL_SETTINGS } from "../types";
import { useStreamerSettings } from "../use-streamer-settings";

function StoredDisplaySettings({
  showDiscordNamesToggle,
  showXboxNamesToggle,
}: {
  readonly showDiscordNamesToggle?: boolean | undefined;
  readonly showXboxNamesToggle?: boolean | undefined;
}): ReactElement {
  const { settings, updateGlobalSettings } = useStreamerSettings();
  return (
    <DisplaySettingsSection
      settings={settings.global.display}
      {...(showDiscordNamesToggle !== undefined && { showDiscordNamesToggle })}
      {...(showXboxNamesToggle !== undefined && { showXboxNamesToggle })}
      onChange={(updates): void => {
        updateGlobalSettings({ display: { ...settings.global.display, ...updates } });
      }}
    />
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("DisplaySettingsSection", () => {
  it.each([
    { showDiscordNamesToggle: false, showXboxNamesToggle: true, showDiscordNames: true, showXboxNames: true },
    { showDiscordNamesToggle: true, showXboxNamesToggle: false, showDiscordNames: true, showXboxNames: false },
  ])("preserves hidden stored name preferences when team details are toggled", (initial) => {
    localStorage.setItem(
      "live-tracker-streamer-settings-global",
      JSON.stringify({
        ...DEFAULT_GLOBAL_SETTINGS,
        display: {
          ...DEFAULT_GLOBAL_SETTINGS.display,
          showDiscordNames: initial.showDiscordNames,
          showXboxNames: initial.showXboxNames,
        },
      }),
    );
    render(
      <StoredDisplaySettings
        showDiscordNamesToggle={initial.showDiscordNamesToggle}
        showXboxNamesToggle={initial.showXboxNamesToggle}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Show Team Details/ }));
    const off = renderHook(() => useStreamerSettings()).result.current.settings.global.display;
    expect(off.showTeamDetails).toBe(false);
    expect(off.showDiscordNames).toBe(initial.showDiscordNamesToggle ? false : initial.showDiscordNames);
    expect(off.showXboxNames).toBe(initial.showXboxNamesToggle ? false : initial.showXboxNames);

    fireEvent.click(screen.getByRole("checkbox", { name: /Show Team Details/ }));
    const on = renderHook(() => useStreamerSettings()).result.current.settings.global.display;
    expect(on.showTeamDetails).toBe(true);
    expect(on.showDiscordNames).toBe(initial.showDiscordNamesToggle ? true : initial.showDiscordNames);
    expect(on.showXboxNames).toBe(initial.showXboxNamesToggle ? true : initial.showXboxNames);
  });

  it("retains live behavior when both name toggles are visible", () => {
    render(<StoredDisplaySettings />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Show Team Details/ }));
    const off = renderHook(() => useStreamerSettings()).result.current.settings.global.display;
    expect(off).toMatchObject({ showTeamDetails: false, showDiscordNames: false, showXboxNames: false });

    fireEvent.click(screen.getByRole("checkbox", { name: /Show Team Details/ }));
    const on = renderHook(() => useStreamerSettings()).result.current.settings.global.display;
    expect(on).toMatchObject({ showTeamDetails: true, showDiscordNames: true, showXboxNames: true });
  });

  it("explains name visibility without considering hidden Discord preferences", () => {
    localStorage.setItem(
      "live-tracker-streamer-settings-global",
      JSON.stringify({ display: { showDiscordNames: true, showXboxNames: false } }),
    );
    render(<StoredDisplaySettings showDiscordNamesToggle={false} />);
    expect(screen.getByText("Only team names will be shown")).toBeInTheDocument();
  });
});
