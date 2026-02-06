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

export function readRecord<K extends string | number | symbol, T>(value: JsonValue): Record<K, T> | null {
  const obj = readJsonObject(value);
  if (!obj) {
    return null;
  }
  return obj as Record<K, T>;
}

export function readStringRecord(value: JsonValue): Record<string, string> | null {
  const obj = readJsonObject(value);
  if (!obj) {
    return null;
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const stringVal = readString(val);
    if (stringVal === null) {
      return null;
    }
    result[key] = stringVal;
  }

  return result;
}
