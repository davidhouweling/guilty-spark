import type { z } from "zod";

export interface JsonResponseOpts {
  status?: number;
  headers?: HeadersInit;
  noStore?: boolean;
}

export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError<T> };

export interface Contract<S extends z.ZodType> {
  readonly schema: S;
  parse(data: unknown): z.infer<S>;
  safeParse(data: unknown): SafeParseResult<z.infer<S>>;
  fromResponse(response: Response): Promise<z.infer<S>>;
  fromRequest(request: Request): Promise<z.infer<S>>;
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
