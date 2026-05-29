import type { z } from "zod";

export interface JsonResponseOpts {
  status?: number;
  headers?: HeadersInit;
  noStore?: boolean;
}

/**
 * A contract pairs a Zod schema with helpers for moving plain data across the
 * API <-> pages boundary. Data is validated when produced (`toResponse`) and
 * when consumed (`fromResponse` / `fromRequest`), so both ends are guaranteed
 * to agree on the shape. The validated value is a plain object — there is no
 * wrapper instance to unwrap.
 */
export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError<T> };

export interface Contract<S extends z.ZodType> {
  readonly schema: S;
  /** Validate unknown data, throwing on mismatch. */
  parse(data: unknown): z.infer<S>;
  /** Validate unknown data without throwing. */
  safeParse(data: unknown): SafeParseResult<z.infer<S>>;
  /** Parse and validate a fetch Response body (client side). */
  fromResponse(response: Response): Promise<z.infer<S>>;
  /** Parse and validate a Request body (server side). */
  fromRequest(request: Request): Promise<z.infer<S>>;
  /** Validate data and serialize it into a JSON Response (server side). */
  toResponse(data: z.infer<S>, opts?: JsonResponseOpts): Response;
}

export function defineContract<S extends z.ZodType>(schema: S): Contract<S> {
  const parseJson = async (source: Response | Request): Promise<z.infer<S>> => {
    return schema.parse(await source.json());
  };

  return {
    schema,
    parse: (data) => schema.parse(data),
    safeParse: (data) => schema.safeParse(data),
    fromResponse: parseJson,
    fromRequest: parseJson,
    toResponse: (data, { status = 200, headers, noStore = false }: JsonResponseOpts = {}): Response => {
      const combinedHeaders = new Headers(headers);
      combinedHeaders.set("Content-Type", "application/json");

      if (noStore) {
        combinedHeaders.set("Cache-Control", "no-store");
      }

      return new Response(JSON.stringify(schema.parse(data)), {
        status,
        headers: combinedHeaders,
      });
    },
  };
}
