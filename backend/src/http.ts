import type { Env, ErrorHandler, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { validator } from 'hono/validator';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string
  ) {
    super(message);
  }
}

/** A non-2xx response from api.github.com. */
export class GithubError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Every error becomes `{ error: message }`, which the frontend's api() reads. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: z.prettifyError(err) }, 400);
  }
  if (err instanceof GithubError) {
    return err.status === 401
      ? c.json({ error: 'GitHub session expired, sign in again' }, 401)
      : c.json({ error: `GitHub error: ${err.message}` }, 502);
  }
  // Hono's own errors: malformed JSON, csrf() rejecting another site, ...
  if (err instanceof HTTPException && err.status < 500) {
    return c.json({ error: err.message || 'Request rejected' }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
};

/*
 * Route validators: `json(schema)` before a handler parses the body with the
 * schema (a ZodError becomes a 400 above) and types `c.req.valid('json')`.
 * The typed client (hono/client) sends the schema's input type; handlers get
 * its output type, after transforms.
 */
type Validated<
  T extends 'json' | 'param',
  S extends z.ZodType,
> = MiddlewareHandler<
  Env,
  string,
  { in: { [K in T]: z.input<S> }; out: { [K in T]: z.output<S> } }
>;

export const json = <S extends z.ZodType>(schema: S) =>
  validator('json', (value) => schema.parse(value)) as Validated<'json', S>;

export const param = <S extends z.ZodType>(schema: S) =>
  validator('param', (value) => schema.parse(value)) as Validated<'param', S>;

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}
