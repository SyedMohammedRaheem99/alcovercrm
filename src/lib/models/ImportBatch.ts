import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { IMPORT_STATUSES, DUPLICATE_STRATEGIES, type ImportStatus, type DuplicateStrategy } from '@/lib/constants/enums';

/**
 * Traceability for every CSV/Excel import.
 *
 * Leads carry `importBatchId`, so a bad import can be located and rolled back
 * precisely. Without this record a mistaken 500-row upload would be effectively
 * unrecoverable.
 */

export interface IImportError {
  row: number;
  field?: string;
  value?: string;
  reason: string;
}

export interface IImportBatch extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  fileName: string;
  fileType: string;
  fileSizeBytes?: number;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  duplicateStrategy: DuplicateStrategy;
  rowErrors: IImportError[];
  mapping: Record<string, string>;
  defaults?: Record<string, unknown>;
  status: ImportStatus;
  startedAt?: Date;
  finishedAt?: Date;
  isRolledBack: boolean;
  rolledBackAt?: Date;
  importedBy?: Types.ObjectId;
  importedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ImportErrorSchema = new Schema<IImportError>(
  {
    row: { type: Number, required: true },
    field: { type: String, trim: true },
    value: { type: String, trim: true, maxlength: 500 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const ImportBatchSchema = new Schema<IImportBatch>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    fileName: { type: String, required: true, trim: true, maxlength: 300 },
    fileType: { type: String, trim: true, maxlength: 40 },
    fileSizeBytes: { type: Number, min: 0 },
    totalRows: { type: Number, default: 0, min: 0 },
    inserted: { type: Number, default: 0, min: 0 },
    updated: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    duplicateStrategy: { type: String, enum: DUPLICATE_STRATEGIES, default: 'SKIP' },
    /** Capped at write time so one broken file cannot bloat the document. */
    rowErrors: { type: [ImportErrorSchema], default: [] },
    /** Column header -> lead field, so an import can be reproduced or explained. */
    mapping: { type: Schema.Types.Mixed, default: {} },
    defaults: { type: Schema.Types.Mixed },
    status: { type: String, enum: IMPORT_STATUSES, default: 'PENDING', required: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    isRolledBack: { type: Boolean, default: false },
    rolledBackAt: { type: Date },
    importedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    importedByName: { type: String, trim: true },
  },
  { timestamps: true, strict: true },
);

ImportBatchSchema.index({ organizationId: 1, createdAt: -1 });

export const ImportBatch: Model<IImportBatch> =
  (models.ImportBatch as Model<IImportBatch>) ||
  model<IImportBatch>('ImportBatch', ImportBatchSchema);

export default ImportBatch;
