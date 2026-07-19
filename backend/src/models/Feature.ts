import { Schema, model, Document } from 'mongoose';

export interface IFeature extends Document {
  project: Schema.Types.ObjectId;
  query: string;
  name: string;
  description: string;
  confidenceScore: number;
  entryPoint: string;
  files: string[];
  apis: string[];
  components: string[];
  models: string[];
  databases: string[];
  dependencies: string[];
  viewsCount: number;
  isPinned: boolean;
  isFavorite: boolean;
  graph: {
    nodes: any[];
    edges: any[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const FeatureSchema = new Schema<IFeature>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    query: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    confidenceScore: {
      type: Number,
      default: 0,
    },
    entryPoint: {
      type: String,
      default: '',
    },
    files: {
      type: [String],
      default: [],
    },
    apis: {
      type: [String],
      default: [],
    },
    components: {
      type: [String],
      default: [],
    },
    models: {
      type: [String],
      default: [],
    },
    databases: {
      type: [String],
      default: [],
    },
    dependencies: {
      type: [String],
      default: [],
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isFavorite: {
      type: Boolean,
      default: false,
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

FeatureSchema.index({ project: 1, query: 1 }, { unique: true });

export const Feature = model<IFeature>('Feature', FeatureSchema);
