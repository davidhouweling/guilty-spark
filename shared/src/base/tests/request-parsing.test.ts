import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody, parseQueryParams } from "../request-parsing";

const schema = z.object({ name: z.string() });

describe("parseQueryParams", () => {
  it("returns parsed data for valid query params", () => {
    expect.assertions(2);
    const result = parseQueryParams(new URL("http://localhost/?name=spartan"), schema, "bad query");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "spartan" });
    }
  });

  it("returns a 400 response for invalid query params", () => {
    expect.assertions(2);
    const result = parseQueryParams(new URL("http://localhost/"), schema, "bad query");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("parseJsonBody", () => {
  function jsonRequest(body: string): Request {
    return new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  it("returns parsed data for a valid JSON body", async () => {
    expect.assertions(2);
    const result = await parseJsonBody(jsonRequest(JSON.stringify({ name: "spartan" })), schema, "bad payload");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "spartan" });
    }
  });

  it("returns a 400 response when the body is not valid JSON", async () => {
    expect.assertions(3);
    const result = await parseJsonBody(jsonRequest("not json"), schema, "bad payload");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      expect(result.response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("returns a 400 response when the body fails schema validation", async () => {
    expect.assertions(2);
    const result = await parseJsonBody(jsonRequest(JSON.stringify({ wrong: true })), schema, "bad payload");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});
