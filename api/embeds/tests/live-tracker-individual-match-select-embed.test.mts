import { describe, expect, it } from "vitest";
import { ComponentType } from "discord-api-types/v10";
import { LiveTrackerIndividualMatchSelectEmbed } from "../live-tracker-individual-match-select-embed.mjs";
import { InteractionComponent } from "../live-tracker-embed.mjs";
import { aFakeMatchHistoryEntryWith } from "../../services/halo/fakes/data.mjs";

describe("LiveTrackerIndividualMatchSelectEmbed", () => {
  it("builds embed and select menu from match history", () => {
    const baseMatch = aFakeMatchHistoryEntryWith({
      matchId: "match-123",
      mapName: "Live Fire",
      modeName: "Slayer",
      outcome: "Win",
      resultString: "Win - 50:30",
      isMatchmaking: true,
    });

    const embed = new LiveTrackerIndividualMatchSelectEmbed({
      gamertag: "TestPlayer",
      locale: "en-US",
      matches: [baseMatch],
    });

    const messageData = embed.toMessageData();

    expect(messageData.embeds?.[0]?.title).toBe("Select matches for TestPlayer");
    expect(messageData.embeds?.[0]?.fields?.[0]?.value).toBe("Matchmaking");
    expect(messageData.embeds?.[0]?.fields?.[1]?.value).toBe("[Matchmaking] Slayer: Live Fire");
    expect(messageData.embeds?.[0]?.fields?.[2]?.value).toBe("Win - 50:30");

    const actionRows = messageData.components ?? [];
    const selectRow = actionRows.find(
      (row) =>
        row.type === ComponentType.ActionRow &&
        row.components.some((component) => component.type === ComponentType.StringSelect),
    );
    const select =
      selectRow?.type === ComponentType.ActionRow
        ? selectRow.components.find((component) => component.type === ComponentType.StringSelect)
        : undefined;
    if (select?.type !== ComponentType.StringSelect) {
      throw new Error("Expected string select menu");
    }

    const buttonRow = actionRows.find(
      (row) =>
        row.type === ComponentType.ActionRow &&
        row.components.some((component) => component.type === ComponentType.Button),
    );
    const button =
      buttonRow?.type === ComponentType.ActionRow
        ? buttonRow.components.find((component) => component.type === ComponentType.Button)
        : undefined;
    if (
      button == null ||
      !("custom_id" in button) ||
      button.custom_id !== InteractionComponent.IndividualStartWithoutGames.toString()
    ) {
      throw new Error("Expected start without games button");
    }

    expect(select.options).toHaveLength(1);
    expect(select.max_values).toBe(1);
  });
});
