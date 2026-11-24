import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ColorSettingsSection } from "../color-settings-section";
import { DEFAULT_COLOR_SETTINGS } from "../types";

afterEach(cleanup);

describe("ColorSettingsSection", () => {
  it("keeps live observer and player controls working", () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      const onModeChange = vi.fn();
      const onObserverViewChange = vi.fn();
      const onPlayerViewChange = vi.fn();
      const view = render(
        <ColorSettingsSection
          {...DEFAULT_COLOR_SETTINGS}
          availablePlayers={[{ id: "123", name: "Player" }]}
          onModeChange={onModeChange}
          onPlayerViewChange={onPlayerViewChange}
          onObserverViewChange={onObserverViewChange}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Select Eagle Team Color" }));
      fireEvent.click(screen.getByRole("button", { name: "Jade" }));
      expect(onObserverViewChange).toHaveBeenCalledWith({ eagleColor: "jade" });
      fireEvent.click(screen.getByRole("button", { name: "Player View" }));
      expect(onModeChange).toHaveBeenCalledWith("player");
      view.rerender(
        <ColorSettingsSection
          {...DEFAULT_COLOR_SETTINGS}
          mode="player"
          availablePlayers={[{ id: "123", name: "Player" }]}
          onModeChange={onModeChange}
          onPlayerViewChange={onPlayerViewChange}
          onObserverViewChange={onObserverViewChange}
        />,
      );
      fireEvent.change(screen.getByLabelText("Select Your Player"), { target: { value: "123" } });
      expect(onPlayerViewChange).toHaveBeenCalledWith({ selectedPlayerId: "123" });
    } finally {
      if (scrollDescriptor == null) {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
      }
    }
  });
});
