import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { UnauthorizedError, ForbiddenError } from '@/lib/auth/session';

/**
 * Uniform API envelopes plus one error handler that every route wraps its body
 * in, so no handler ever leaks a stack trace or a raw driver error to the client.
 */

export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, meta, { status: 201 });
}

export function fail(error: string, status = 400, fieldErrors?: Record<string, string[]>) {
  return NextResponse.json<ApiFailure>({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'That already exists') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  fieldErrors?: Record<string, string[]>;
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

interface MongoDuplicateError {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/**
 * Convert any thrown value into a safe response.
 *
 * Unexpected errors are logged server-side but reported generically, so internal
 * details never reach the browser.
 */
export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.errors) {
      const key = issue.path.join('.') || 'form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = err.errors[0]?.message ?? 'Please check the highlighted fields';
    return fail(first, 422, fieldErrors);
  }

  if (err instanceof ValidationError) return fail(err.message, 422, err.fieldErrors);
  if (err instanceof UnauthorizedError) return fail(err.message, 401);
  if (err instanceof ForbiddenError) return fail(err.message, 403);
  if (err instanceof NotFoundError) return fail(err.message, 404);
  if (err instanceof ConflictError) return fail(err.message, 409);

  // Mongo duplicate key — surface which field collided, without echoing the value.
  const mongoErr = err as MongoDuplicateError;
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyPattern ?? {}).find((k) => k !== 'organizationId');
    if (field === 'phoneNormalized') {
      return fail('A lead with this phone number already exists', 409);
    }
    if (field === 'email') {
      return fail('An account with this email already exists', 409);
    }
    return fail('That record already exists', 409);
  }

  // Mongoose validation (a schema rule the Zod layer did not cover).
  const validationErr = err as { name?: string; errors?: Record<string, { message: string }> };
  if (validationErr?.name === 'ValidationError' && validationErr.errors) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(validationErr.errors)) {
      fieldErrors[key] = [value.message];
    }
    return fail('Please check the highlighted fields', 422, fieldErrors);
  }

  console.error('[API ERROR]', err);
  return fail('Something went wrong. Please try again.', 500);
}

/** Standard pagination metadata for list endpoints. */
export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}
