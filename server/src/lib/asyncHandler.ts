import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so a rejected promise is routed
 * to next(err) instead of becoming a silent unhandled rejection.
 *
 * Express 4 (what this project runs) does NOT do this automatically —
 * only Express 5 catches rejections from async handlers for you.
 * Without this wrapper, an unexpected error thrown inside an `async`
 * controller (e.g. a transient DB error Prisma doesn't already handle)
 * never reaches the centralized error handler in app.ts, and the
 * request just hangs with no response ever sent to the client.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
