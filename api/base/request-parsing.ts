import type { ZodType } from "zod";

export type ParsedBodyResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: Response;
    };

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  invalidPayloadMessage: string,
  invalidJsonMessage = invalidPayloadMessage,
): Promise<ParsedBodyResult<T>> {
  let jsonBody: unknown;

  try {
    jsonBody = await request.json();
  } catch {
    return {
      success: false,
      response: new Response(invalidJsonMessage, { status: 400 }),
    };
  }

  const parsedBody = schema.safeParse(jsonBody);

  if (!parsedBody.success) {
    return {
      success: false,
      response: new Response(invalidPayloadMessage, { status: 400 }),
    };
  }

  return {
    success: true,
    data: parsedBody.data,
  };
}

export function parseQueryParams<T>(url: URL, schema: ZodType<T>, invalidPayloadMessage: string): ParsedBodyResult<T> {
  const queryPayload: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  const parsedQuery = schema.safeParse(queryPayload);

  if (!parsedQuery.success) {
    return {
      success: false,
      response: new Response(invalidPayloadMessage, { status: 400 }),
    };
  }

  return {
    success: true,
    data: parsedQuery.data,
  };
}
