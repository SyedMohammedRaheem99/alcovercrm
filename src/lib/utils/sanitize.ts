/**
 * Input sanitisation helpers.
 *
 * The most important one here is `sanitizeMongoInput`: MongoDB treats keys
 * beginning with `$` as operators, so a request body like
 * `{ "email": { "$ne": null } }` can subvert a query if passed through
 * unchecked. Zod handles shape validation; this handles operator injection for
 * any value that reaches a query.
 */

/**
 * True only for object literals (`{}` / `Object.create(null)`).
 *
 * Class instances — ObjectId, Date, RegExp, Buffer — return false so the
 * sanitiser treats them as opaque values instead of walking their internals.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Recursively strip keys starting with `$` or containing `.` from objects. */
export function sanitizeMongoInput<T>(input: T, depth = 0): T {
  if (depth > 10) return input; // guard against deeply nested / cyclic payloads

  if (Array.isArray(input)) {
    return input.map((v) => sanitizeMongoInput(v, depth + 1)) as unknown as T;
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    // Never recurse into BSON/class instances such as ObjectId, RegExp or
    // Buffer. They are plain values as far as a query is concerned, and walking
    // their internals would corrupt them (an ObjectId would become {i0,i1,...}).
    if (!isPlainObject(input)) return input;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

      const cleaned = sanitizeMongoInput(value, depth + 1);

      // If a value was ONLY operators (e.g. `{ $ne: null }`), stripping them
      // leaves `{}`. Passing that to Mongoose throws a CastError on a typed
      // field, so drop the key entirely — a hostile filter should be ignored,
      // not turned into a 500.
      if (
        cleaned !== null &&
        typeof cleaned === 'object' &&
        !Array.isArray(cleaned) &&
        !(cleaned instanceof Date) &&
        Object.keys(cleaned as Record<string, unknown>).length === 0 &&
        value !== null &&
        typeof value === 'object' &&
        Object.keys(value as Record<string, unknown>).length > 0
      ) {
        continue;
      }

      out[key] = cleaned;
    }
    return out as T;
  }

  return input;
}

/** Escape a user-supplied string so it is safe inside a RegExp. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse whitespace and trim. */
export function cleanString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Title-case a name for consistent display: "  rAvi   KUMAR " -> "Ravi Kumar" */
export function toTitleCase(v: unknown): string {
  return cleanString(v)
    .toLowerCase()
    .replace(/(^|\s|['-])([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());
}

/** Normalise an email for storage and comparison. */
export function normalizeEmail(v: unknown): string {
  return cleanString(v).toLowerCase();
}

/** Strip characters that would break a CSV cell or enable formula injection. */
export function csvSafe(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // A leading =, +, -, @, tab or CR makes Excel/Sheets treat the cell as a formula.
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
