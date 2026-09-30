import type { APIMessage } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { z } from "zod";
import type { MapMode } from "../../services/halo/hcs";
import { ALL_MODES, MAP_COUNTS } from "../../services/halo/hcs";
import { MapsFormatType, MapsPlaylistType } from "../../services/database/types/guild_config";
import { InteractionComponent } from "../../embeds/maps-embed";
import { GAMECOACH_GG_URLS } from "./gamecoachgg";

export interface MapsDraft {
  userId: string;
  locked: boolean;
  count: number;
  playlist: MapsPlaylistType;
  format: MapsFormatType;
  maps: { mode: MapMode; map: string }[];
}

export function normalizeMapsFormat(format: MapsFormatType, availableModes: MapMode[]): MapsFormatType {
  return availableModes.length > 1 ? format : MapsFormatType.SLAYER;
}

function readSelectedValue(message: APIMessage, customId: string): string {
  for (const row of message.components ?? []) {
    if (row.type !== ComponentType.ActionRow) {
      continue;
    }

    for (const component of row.components) {
      if (component.type !== ComponentType.StringSelect || component.custom_id !== customId) {
        continue;
      }

      return Preconditions.checkExists(
        component.options.find((option) => option.default === true)?.value,
        `No selected value for ${customId}`,
      );
    }
  }

  throw new Error(`No select menu found for ${customId}`);
}

function isMapsMessageLocked(message: APIMessage): boolean {
  const confirmCustomId: string = InteractionComponent.Confirm;
  for (const row of message.components ?? []) {
    if (row.type !== ComponentType.ActionRow) {
      continue;
    }

    for (const component of row.components) {
      if (
        component.type === ComponentType.Button &&
        "custom_id" in component &&
        component.custom_id === confirmCustomId
      ) {
        return component.disabled === true;
      }
    }
  }

  return false;
}

function readMapName(value: string): string {
  const link = /^\[[^\]]+\]\(([^)]+)\)$/.exec(value);
  if (link == null) {
    return value;
  }

  const url = Preconditions.checkExists(link[1]);
  return Preconditions.checkExists(
    Object.entries(GAMECOACH_GG_URLS).find(([, candidateUrl]) => candidateUrl === url)?.[0],
    `Unknown map link ${url}`,
  );
}

function readMapsFromEmbeds(message: APIMessage): { mode: MapMode; map: string }[] {
  const fields = message.embeds.flatMap((embed) => embed.fields ?? []);
  const numberFields = fields.filter((field) => field.name === "#");
  const modeFields = fields.filter((field) => field.name === "Mode");
  const mapFields = fields.filter((field) => field.name === "Map");

  if (numberFields.length === 0 && modeFields.length === 0 && mapFields.length === 0) {
    return [];
  }

  if (
    numberFields.length === 0 ||
    numberFields.length !== modeFields.length ||
    numberFields.length !== mapFields.length
  ) {
    throw new Error("Map table fields are incomplete");
  }

  const maps: { mode: MapMode; map: string }[] = [];
  for (let fieldIndex = 0; fieldIndex < numberFields.length; fieldIndex++) {
    const gameNumbers = Preconditions.checkExists(numberFields[fieldIndex]).value.split("\n");
    const modes = Preconditions.checkExists(modeFields[fieldIndex]).value.split("\n");
    const mapNames = Preconditions.checkExists(mapFields[fieldIndex]).value.split("\n");
    if (gameNumbers.length !== modes.length || gameNumbers.length !== mapNames.length) {
      throw new Error("Map table columns do not align");
    }

    for (let rowIndex = 0; rowIndex < gameNumbers.length; rowIndex++) {
      if (Number(gameNumbers[rowIndex]) !== maps.length + 1) {
        throw new Error("Map table game numbers are out of order");
      }
      const modeValue = Preconditions.checkExists(modes[rowIndex]);
      const mode = Preconditions.checkExists(ALL_MODES.find((candidate) => candidate === modeValue));
      maps.push({ mode, map: readMapName(Preconditions.checkExists(mapNames[rowIndex])) });
    }
  }

  return maps;
}

export function readMapsDraftFromMessage(message: APIMessage, userId: string): MapsDraft {
  const count = Number(readSelectedValue(message, InteractionComponent.CountSelect));
  if (!MAP_COUNTS.includes(count)) {
    throw new Error("Map count was not selected");
  }

  const playlist = z.enum(MapsPlaylistType).parse(readSelectedValue(message, InteractionComponent.PlaylistSelect));
  const format = z.enum(MapsFormatType).parse(readSelectedValue(message, InteractionComponent.FormatSelect));
  const maps = readMapsFromEmbeds(message);
  if (maps.length !== 0 && maps.length !== count) {
    throw new Error("Map list does not match the selected count");
  }

  return { userId, locked: isMapsMessageLocked(message), count, playlist, format, maps };
}
