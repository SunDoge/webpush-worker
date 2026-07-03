import { Context } from 'hono';
import { JsonResult } from '../types';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export function successResponse<T>(c: Context, data: T, status?: ContentfulStatusCode) {
  return c.json({ success: true, data } as JsonResult<T, never>, status);
}

export function errorResponse<E>(c: Context, error: E, status?: ContentfulStatusCode) {
  return c.json({ success: false, error } as JsonResult<never, E>, status);
}

export function serverError<E>(c: Context, error: E) {
  console.error('[server error]', error);
  return errorResponse(c, 'Internal server error', 500);
}
