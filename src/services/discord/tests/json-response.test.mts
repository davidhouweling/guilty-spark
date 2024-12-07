import { beforeEach, describe, expect, it } from "vitest";
import { JsonResponse } from "../json-response.mjs";

describe("JsonResponse", () => {
  let jsonResponse: JsonResponse;

  beforeEach(() => {
    jsonResponse = new JsonResponse({ message: "Hello, World!" });
  });

  it("has content-type header", () => {
    const headers = jsonResponse.headers;
    expect(headers.get("content-type")).toBe("application/json;charset=UTF-8");
  });

  it("has JSON body", async () => {
    const body = await jsonResponse.json();
    expect(body).toEqual({ message: "Hello, World!" });
  });
});
