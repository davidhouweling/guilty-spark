import type { ZodType } from "zod";
import { errorContract } from "../contracts/error";

export type ParsedBodyResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: Response;
    };

export function parseQueryParams<T>(url: URL, schema: ZodType<T>, invalidPayloadMessage: string): ParsedBodyResult<T> {
  const queryPayload: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  const parsedQuery = schema.safeParse(queryPayload);

  if (!parsedQuery.success) {
    return {
      success: false,
      response: errorContract.toResponse({ error: invalidPayloadMessage }, { status: 400, noStore: true }),
    };
  }

  return {
    success: true,
    data: parsedQuery.data,
  };
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  invalidPayloadMessage: string,
): Promise<ParsedBodyResult<T>> {
  const invalid: ParsedBodyResult<T> = {
    success: false,
    response: errorContract.toResponse({ error: invalidPayloadMessage }, { status: 400, noStore: true }),
  };

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return invalid;
  }

  const parsedBody = schema.safeParse(jsonBody);
  if (!parsedBody.success) {
    return invalid;
  }

  return {
    success: true,
    data: parsedBody.data,
  };
}
