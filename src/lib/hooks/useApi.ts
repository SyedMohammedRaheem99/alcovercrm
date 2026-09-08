'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal fetch layer for the app.
 *
 * Deliberately not SWR/React Query: the data needs here are simple (fetch a
 * list, mutate, refetch) and every extra client dependency costs bundle size on
 * a phone over a patchy 3G connection, which is the target device for this CRM.
 */

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  meta?: Record<string, unknown>;
}

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Same-origin custom header: a cross-site form POST cannot set this, so it
      // acts as a lightweight CSRF check alongside the SameSite=Lax cookie.
      'X-Requested-With': 'fetch',
      ...options.headers,
    },
    credentials: 'same-origin',
  });

  let body: ApiResult<T>;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiError('The server returned an unexpected response', res.status);
  }

  if (!res.ok || !body.ok) {
    // A 401 means the session expired — send them back to login rather than
    // showing a confusing error on a screen they can no longer use.
    if (res.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(body.error ?? 'Something went wrong', res.status, body.fieldErrors);
  }

  return { data: body.data as T, meta: body.meta };
}

/** GET with loading/error state and a manual `refetch`. */
export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | undefined>();
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow earlier request overwriting a newer result.
  const requestId = useRef(0);

  const run = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<T>(url);
      if (id === requestId.current) {
        setData(result.data);
        setMeta(result.meta);
      }
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, meta, loading, error, refetch: run, setData };
}

/** POST/PATCH/DELETE with submitting state and field-level errors. */
export function useMutation<TInput, TOutput>(
  url: string | ((input: TInput) => string),
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setSubmitting(true);
      setError(null);
      setFieldErrors({});

      try {
        const endpoint = typeof url === 'function' ? url(input) : url;
        const result = await apiFetch<TOutput>(endpoint, {
          method,
          body: method === 'DELETE' && input === undefined ? undefined : JSON.stringify(input),
        });
        return result.data;
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
          if (err.fieldErrors) setFieldErrors(err.fieldErrors);
        } else {
          setError('Something went wrong');
        }
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [url, method],
  );

  return { mutate, submitting, error, fieldErrors, setError };
}

/** Debounce a fast-changing value (used by the leads search box). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
