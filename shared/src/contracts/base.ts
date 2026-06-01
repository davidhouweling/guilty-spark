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
  toResponse(data: z.infer<S>, opts?: JsonResponseOpts): Response;
}

export function defineContract<S extends z.ZodType>(schema: S): Contract<S> {
  return {
    schema,
    parse: (data) => schema.parse(data),
    safeParse: (data) => schema.safeParse(data),
    fromResponse: async (response) => schema.parse(await response.json()),
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

export interface MessageContract<S extends z.ZodType> {
  readonly schema: S;
  parse(raw: string): z.infer<S>;
  serialize(data: z.infer<S>): string;
}

export function defineMessageContract<S extends z.ZodType>(schema: S): MessageContract<S> {
  return {
    schema,
    parse: (raw) => schema.parse(JSON.parse(raw)),
    serialize: (data) => JSON.stringify(schema.parse(data)),
  };
}
