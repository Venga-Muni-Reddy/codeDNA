import { Schema, model, Document } from 'mongoose';

export interface ISecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  type: string;
  description: string;
  code?: string;
}

export interface IQualityIssue {
  type: 'dead-code' | 'complexity' | 'duplicate' | 'long-method' | 'circular-dependency';
  file: string;
  line?: number;
  description: string;
  detail?: string;
}

export interface IScanResult extends Document {
  project: Schema.Types.ObjectId;
  linesOfCode: number;
  fileCount: number;
  folderCount: number;
  complexityScore: number;
  securityIssues: ISecurityIssue[];
  qualityIssues: IQualityIssue[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SecurityIssueSchema = new Schema<ISecurityIssue>({
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
  },
  file: { type: String, required: true },
  line: { type: Number, required: true },
  type: { type: String, required: true },
  description: { type: String, required: true },
  code: { type: String },
});

const QualityIssueSchema = new Schema<IQualityIssue>({
  type: {
    type: String,
    enum: ['dead-code', 'complexity', 'duplicate', 'long-method', 'circular-dependency'],
    required: true,
  },
  file: { type: String, required: true },
  line: { type: Number },
  description: { type: String, required: true },
  detail: { type: String },
});

const ScanResultSchema = new Schema<IScanResult>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    linesOfCode: {
      type: Number,
      default: 0,
    },
    fileCount: {
      type: Number,
      default: 0,
    },
    folderCount: {
      type: Number,
      default: 0,
    },
    complexityScore: {
      type: Number,
      default: 0,
    },
    securityIssues: {
      type: [SecurityIssueSchema],
      default: [],
    },
    qualityIssues: {
      type: [QualityIssueSchema],
      default: [],
    },
    summary: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const ScanResult = model<IScanResult>('ScanResult', ScanResultSchema);
