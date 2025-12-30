import type { JsonObject, JsonValue } from "./json.mts";

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJsonObject(value: JsonValue): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

export function readJsonArray(value: JsonValue): readonly JsonValue[] | null {
  return Array.isArray(value) ? value : null;
}

export function readString(value: JsonValue): string | null {
  return typeof value === "string" ? value : null;
}

export function readNumber(value: JsonValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readNullableString(value: JsonValue): string | null {
  return value === null ? null : readString(value);
}
