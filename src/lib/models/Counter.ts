import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';

/**
 * Atomic sequence generator for human-readable codes (LD-000142, QT-2026-0007).
 *
 * Counting documents to derive the next number is a race: two concurrent
 * requests both read N and both write N+1, producing a duplicate code. A single
 * `findOneAndUpdate` with `$inc` is atomic at the document level, so every
 * caller is guaranteed a unique value even under parallel Lambda invocations.
 */

export interface ICounter extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  key: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    key: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: false, strict: true },
);

CounterSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export const Counter: Model<ICounter> =
  (models.Counter as Model<ICounter>) || model<ICounter>('Counter', CounterSchema);

/**
 * Reserve and return the next value in a sequence. Atomic and safe to call
 * concurrently.
 */
export async function nextSequence(
  organizationId: Types.ObjectId | string,
  key: string,
): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { organizationId, key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return doc?.seq ?? 1;
}

/** Format a sequence into a padded code, e.g. ("LD", 142) -> "LD-000142". */
export function formatCode(prefix: string, seq: number, pad = 6): string {
  return `${prefix}-${String(seq).padStart(pad, '0')}`;
}

export default Counter;
