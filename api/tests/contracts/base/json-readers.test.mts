import { describe, expect, it } from "vitest";
import {
  isJsonObject,
  readJsonObject,
  readJsonArray,
  readString,
  readNumber,
  readNullableString,
  readRecord,
  readStringRecord,
} from "@guilty-spark/contracts/base/json-readers";

describe("isJsonObject", () => {
  it("returns true for plain objects", () => {
    const result = isJsonObject({ key: "value" });

    expect(result).toBe(true);
  });

  it("returns false for null", () => {
    const result = isJsonObject(null);

    expect(result).toBe(false);
  });

  it("returns false for arrays", () => {
    const result = isJsonObject([1, 2, 3]);

    expect(result).toBe(false);
  });

  it("returns false for strings", () => {
    const result = isJsonObject("string");

    expect(result).toBe(false);
  });

  it("returns false for numbers", () => {
    const result = isJsonObject(42);

    expect(result).toBe(false);
  });

  it("returns false for booleans", () => {
    const result = isJsonObject(true);

    expect(result).toBe(false);
  });
});

describe("readJsonObject", () => {
  it("returns object for valid plain object", () => {
    const obj = { key: "value" };

    const result = readJsonObject(obj);

    expect(result).toEqual(obj);
  });

  it("returns null for null", () => {
    const result = readJsonObject(null);

    expect(result).toBeNull();
  });

  it("returns null for arrays", () => {
    const result = readJsonObject([1, 2, 3]);

    expect(result).toBeNull();
  });

  it("returns null for strings", () => {
    const result = readJsonObject("string");

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readJsonObject(123);

    expect(result).toBeNull();
  });
});

describe("readJsonArray", () => {
  it("returns array for valid array", () => {
    const arr = [1, 2, 3];

    const result = readJsonArray(arr);

    expect(result).toEqual(arr);
  });

  it("returns empty array for empty array", () => {
    const result = readJsonArray([]);

    expect(result).toEqual([]);
  });

  it("returns null for null", () => {
    const result = readJsonArray(null);

    expect(result).toBeNull();
  });

  it("returns null for objects", () => {
    const result = readJsonArray({ key: "value" });

    expect(result).toBeNull();
  });

  it("returns null for strings", () => {
    const result = readJsonArray("string");

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readJsonArray(42);

    expect(result).toBeNull();
  });
});

describe("readString", () => {
  it("returns string for valid string", () => {
    const result = readString("hello");

    expect(result).toBe("hello");
  });

  it("returns empty string for empty string", () => {
    const result = readString("");

    expect(result).toBe("");
  });

  it("returns null for null", () => {
    const result = readString(null);

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readString(123);

    expect(result).toBeNull();
  });

  it("returns null for objects", () => {
    const result = readString({ key: "value" });

    expect(result).toBeNull();
  });

  it("returns null for arrays", () => {
    const result = readString([1, 2, 3]);

    expect(result).toBeNull();
  });

  it("returns null for booleans", () => {
    const result = readString(true);

    expect(result).toBeNull();
  });
});

describe("readNumber", () => {
  it("returns number for valid number", () => {
    const result = readNumber(42);

    expect(result).toBe(42);
  });

  it("returns zero for zero", () => {
    const result = readNumber(0);

    expect(result).toBe(0);
  });

  it("returns negative numbers", () => {
    const result = readNumber(-100);

    expect(result).toBe(-100);
  });

  it("returns decimal numbers", () => {
    const result = readNumber(3.14);

    expect(result).toBe(3.14);
  });

  it("returns null for null", () => {
    const result = readNumber(null);

    expect(result).toBeNull();
  });

  it("returns null for strings", () => {
    const result = readNumber("123");

    expect(result).toBeNull();
  });

  it("returns null for NaN", () => {
    const result = readNumber(NaN);

    expect(result).toBeNull();
  });

  it("returns null for Infinity", () => {
    const result = readNumber(Infinity);

    expect(result).toBeNull();
  });

  it("returns null for negative Infinity", () => {
    const result = readNumber(-Infinity);

    expect(result).toBeNull();
  });

  it("returns null for objects", () => {
    const result = readNumber({ key: "value" });

    expect(result).toBeNull();
  });

  it("returns null for arrays", () => {
    const result = readNumber([1, 2, 3]);

    expect(result).toBeNull();
  });
});

describe("readNullableString", () => {
  it("returns string for valid string", () => {
    const result = readNullableString("hello");

    expect(result).toBe("hello");
  });

  it("returns null for null value", () => {
    const result = readNullableString(null);

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readNullableString(123);

    expect(result).toBeNull();
  });

  it("returns null for objects", () => {
    const result = readNullableString({ key: "value" });

    expect(result).toBeNull();
  });

  it("returns empty string for empty string", () => {
    const result = readNullableString("");

    expect(result).toBe("");
  });
});

describe("readRecord", () => {
  it("returns record for valid object", () => {
    const obj = { key1: "value1", key2: "value2" };

    const result = readRecord(obj);

    expect(result).toEqual(obj);
  });

  it("returns empty record for empty object", () => {
    const result = readRecord({});

    expect(result).toEqual({});
  });

  it("returns null for null", () => {
    const result = readRecord(null);

    expect(result).toBeNull();
  });

  it("returns null for arrays", () => {
    const result = readRecord([1, 2, 3]);

    expect(result).toBeNull();
  });

  it("returns null for strings", () => {
    const result = readRecord("string");

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readRecord(42);

    expect(result).toBeNull();
  });

  it("returns typed record with generic parameter", () => {
    const obj = { a: 1, b: 2 };

    const result = readRecord<string, number>(obj);

    expect(result).toEqual(obj);
  });
});

describe("readStringRecord", () => {
  it("returns record for valid string-to-string object", () => {
    const obj = { key1: "value1", key2: "value2" };

    const result = readStringRecord(obj);

    expect(result).toEqual(obj);
  });

  it("returns empty record for empty object", () => {
    const result = readStringRecord({});

    expect(result).toEqual({});
  });

  it("returns null for null", () => {
    const result = readStringRecord(null);

    expect(result).toBeNull();
  });

  it("returns null for arrays", () => {
    const result = readStringRecord([1, 2, 3]);

    expect(result).toBeNull();
  });

  it("returns null when value is not a string", () => {
    const obj = { key1: "value1", key2: 123 };

    const result = readStringRecord(obj);

    expect(result).toBeNull();
  });

  it("returns null when value is null", () => {
    const obj = { key1: "value1", key2: null };

    const result = readStringRecord(obj);

    expect(result).toBeNull();
  });

  it("returns null when value is an object", () => {
    const obj = { key1: "value1", key2: { nested: "value" } };

    const result = readStringRecord(obj);

    expect(result).toBeNull();
  });

  it("returns null when value is an array", () => {
    const obj = { key1: "value1", key2: ["array"] };

    const result = readStringRecord(obj);

    expect(result).toBeNull();
  });

  it("handles empty strings as valid values", () => {
    const obj = { key1: "", key2: "value2" };

    const result = readStringRecord(obj);

    expect(result).toEqual(obj);
  });

  it("returns null for strings", () => {
    const result = readStringRecord("string");

    expect(result).toBeNull();
  });

  it("returns null for numbers", () => {
    const result = readStringRecord(123);

    expect(result).toBeNull();
  });
});
