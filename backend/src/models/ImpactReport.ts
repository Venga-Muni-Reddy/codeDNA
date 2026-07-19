import { Schema, model, Document } from 'mongoose';

export interface IImpactReport extends Document {
  project: Schema.Types.ObjectId;
  fileNode: Schema.Types.ObjectId;
  riskScore: number;
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  directAffected: string[];
  indirectAffected: string[];
  businessFeatures: string[];
  apisAffected: string[];
  componentsAffected: string[];
  modelsAffected: string[];
  graph: {
    nodes: any[];
    edges: any[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const ImpactReportSchema = new Schema<IImpactReport>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    fileNode: {
      type: Schema.Types.ObjectId,
      ref: 'FileNode',
      required: true,
      index: true,
    },
    riskScore: {
      type: Number,
      default: 0,
    },
    riskLabel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'LOW',
    },
    directAffected: {
      type: [String],
      default: [],
    },
    indirectAffected: {
      type: [String],
      default: [],
    },
    businessFeatures: {
      type: [String],
      default: [],
    },
    apisAffected: {
      type: [String],
      default: [],
    },
    componentsAffected: {
      type: [String],
      default: [],
    },
    modelsAffected: {
      type: [String],
      default: [],
    },
    graph: {
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] },
    },
  },
  {
    timestamps: true,
  }
);

// One report per project file scan cache
ImpactReportSchema.index({ project: 1, fileNode: 1 }, { unique: true });

export const ImpactReport = model<IImpactReport>('ImpactReport', ImpactReportSchema);
