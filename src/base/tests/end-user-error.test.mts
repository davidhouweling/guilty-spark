import type { APIEmbed } from "discord-api-types/v10";
import { ButtonStyle, ComponentType, EmbedType } from "discord-api-types/v10";
import { describe, it, expect } from "vitest";
import { EndUserError, EndUserErrorType, EndUserErrorColor } from "../end-user-error.mjs";

describe("EndUserError", () => {
  describe("constructor", () => {
    it("creates an error with default options", () => {
      const error = new EndUserError("Something went wrong");

      expect(error.endUserMessage).toBe("Something went wrong");
      expect(error.title).toBe("Something went wrong");
      expect(error.errorType).toBe(EndUserErrorType.ERROR);
      expect(error.handled).toBe(false);
      expect(error.actions).toBeUndefined();
      expect(error.callbackType).toBeUndefined();
      expect(error.data).toEqual({});
    });

    it("creates an error with custom options", () => {
      const error = new EndUserError("Custom error message", {
        title: "Custom Title",
        errorType: EndUserErrorType.WARNING,
        handled: true,
        actions: ["connect"],
        callbackType: "stats",
        data: { key: "value" },
      });

      expect(error.endUserMessage).toBe("Custom error message");
      expect(error.title).toBe("Custom Title");
      expect(error.errorType).toBe(EndUserErrorType.WARNING);
      expect(error.handled).toBe(true);
      expect(error.actions).toEqual(["connect"]);
      expect(error.callbackType).toBe("stats");
      expect(error.data).toEqual({ key: "value" });
    });

    it("inherits from Error and preserves stack trace", () => {
      const error = new EndUserError("Test error");

      expect(error instanceof Error).toBe(true);
      expect(error instanceof EndUserError).toBe(true);
      expect(error.name).toBe("EndUserError");
      expect(error.message).toBe("Test error");
      expect(error.stack).toBeDefined();
    });

    it("handles inner error properly", () => {
      const innerError = new Error("Inner error message");
      const error = new EndUserError("Outer error", { innerError });

      expect(error.endUserMessage).toBe("Outer error");
      expect(error.message).toBe("Inner error message");
      expect(error.stack).toContain("Inner error message");
    });
  });

  describe("discordEmbed getter", () => {
    it("creates an error embed with default settings", () => {
      const error = new EndUserError("Something went wrong");
      const embed = error.discordEmbed;

      expect(embed.title).toBe("Something went wrong");
      expect(embed.description).toBe("Something went wrong");
      expect(embed.color).toBe(EndUserErrorColor.ERROR);
      expect(embed.fields).toEqual([]);
    });

    it("creates a warning embed", () => {
      const error = new EndUserError("Warning message", {
        errorType: EndUserErrorType.WARNING,
      });
      const embed = error.discordEmbed;

      expect(embed.title).toBe("Something went wrong");
      expect(embed.description).toBe("Warning message");
      expect(embed.color).toBe(EndUserErrorColor.WARNING);
    });

    it("creates an embed with custom title", () => {
      const error = new EndUserError("Error message", {
        title: "Custom Error Title",
      });
      const embed = error.discordEmbed;

      expect(embed.title).toBe("Custom Error Title");
      expect(embed.description).toBe("Error message");
    });

    it("includes additional data in fields", () => {
      const error = new EndUserError("Error with data", {
        data: { user: "123", action: "test" },
      });
      const embed = error.discordEmbed;

      expect(embed.fields).toHaveLength(1);
      expect(embed.fields?.[0]?.name).toBe("Additional Information");
      expect(embed.fields?.[0]?.value).toContain("**user**: 123");
      expect(embed.fields?.[0]?.value).toContain("**action**: test");
    });

    it("includes callback type in fields", () => {
      const error = new EndUserError("Error with callback", {
        callbackType: "stats",
      });
      const embed = error.discordEmbed;

      expect(embed.fields).toHaveLength(1);
      expect(embed.fields?.[0]?.value).toContain("**Callback**: stats");
    });
  });

  describe("discordActions getter", () => {
    it("returns empty array when no actions are specified", () => {
      const error = new EndUserError("Test error");

      expect(error.discordActions).toEqual([]);
    });

    it("returns empty array when actions array is empty", () => {
      const error = new EndUserError("Test error", { actions: [] });

      expect(error.discordActions).toEqual([]);
    });

    it("returns connect button when connect action is specified", () => {
      const error = new EndUserError("Test error", { actions: ["connect"] });
      const actions = error.discordActions;

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: "Connect",
            custom_id: "btn_connect_initiate",
            emoji: {
              name: "🔌",
            },
          },
        ],
      });
    });
  });

  describe("fromDiscordEmbed static method", () => {
    it("creates EndUserError from valid embed", () => {
      const embed: APIEmbed = {
        type: EmbedType.Rich,
        title: "No matches found",
        description:
          "Unable to match any of the Discord users to their Xbox accounts.\n**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
        color: 16776960,
        fields: [
          {
            name: "Additional Information",
            value:
              "**Callback**: stats\n**Channel**: <#1000000000000000000>\n**Queue**: 2\n**Completed**: <t:1742634297:f>",
            inline: false,
          },
        ],
      };

      const error = EndUserError.fromDiscordEmbed(embed);

      expect(error).toBeInstanceOf(EndUserError);
      expect(error?.endUserMessage).toBe(embed.description);
      expect(error?.title).toBe(embed.title);
      expect(error?.errorType).toBe(EndUserErrorType.WARNING);
      expect(error?.handled).toBe(false);
      expect(error?.callbackType).toBe("stats");
      expect(error?.data).toEqual({
        Channel: "<#1000000000000000000>",
        Completed: "<t:1742634297:f>",
        Queue: "2",
      });
    });

    it("returns undefined for invalid embed", () => {
      const embed = {
        title: "Test",
        description: "Test",
        color: 0x123456, // Invalid color
      };

      const error = EndUserError.fromDiscordEmbed(embed);

      expect(error).toBeUndefined();
    });

    it("handles callback type from embed", () => {
      const embed = {
        title: "Test Error",
        description: "Test description",
        color: EndUserErrorColor.WARNING,
        fields: [
          {
            name: "Additional Information",
            value: "Callback: stats\n**key**: value", // Note: Callback without markdown bold for the current parser
          },
        ],
      };

      const error = EndUserError.fromDiscordEmbed(embed);

      expect(error?.callbackType).toBe("stats");
      expect(error?.data).toEqual({ key: "value" });
    });
  });

  describe("appendData method", () => {
    it("appends new data to existing data", () => {
      const error = new EndUserError("Test error", {
        data: { existing: "value" },
      });

      error.appendData({ new: "data", another: "item" });

      expect(error.data).toEqual({
        existing: "value",
        new: "data",
        another: "item",
      });
    });

    it("overwrites existing keys", () => {
      const error = new EndUserError("Test error", {
        data: { key: "old_value" },
      });

      error.appendData({ key: "new_value" });

      expect(error.data).toEqual({ key: "new_value" });
    });
  });

  describe("EndUserErrorType enum", () => {
    it("has correct values", () => {
      expect(EndUserErrorType.ERROR).toBe("error");
      expect(EndUserErrorType.WARNING).toBe("warning");
    });
  });

  describe("EndUserErrorColor enum", () => {
    it("has correct color values", () => {
      expect(EndUserErrorColor.ERROR).toBe(0xff0000); // Red
      expect(EndUserErrorColor.WARNING).toBe(0xffff00); // Yellow
    });
  });
});
