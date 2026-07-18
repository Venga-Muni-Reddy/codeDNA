import { Schema, model, Document } from 'mongoose';

export interface IClassItem {
  name: string;
  methods: string[];
  startLine: number;
  endLine: number;
}

export interface IFunctionItem {
  name: string;
  startLine: number;
  endLine: number;
}

export interface IFileNode extends Document {
  project: Schema.Types.ObjectId;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  parentPath: string;
  classes: IClassItem[];
  functions: IFunctionItem[];
  imports: string[];
  exports: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ClassItemSchema = new Schema<IClassItem>({
  name: { type: String, required: true },
  methods: { type: [String], default: [] },
  startLine: { type: Number, required: true },
  endLine: { type: Number, required: true },
});

const FunctionItemSchema = new Schema<IFunctionItem>({
  name: { type: String, required: true },
  startLine: { type: Number, required: true },
  endLine: { type: Number, required: true },
});

const FileNodeSchema = new Schema<IFileNode>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['file', 'directory'],
      required: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    parentPath: {
      type: String,
      default: '',
    },
    classes: {
      type: [ClassItemSchema],
      default: [],
    },
    functions: {
      type: [FunctionItemSchema],
      default: [],
    },
    imports: {
      type: [String],
      default: [],
    },
    exports: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee uniqueness of path within a single project scan
FileNodeSchema.index({ project: 1, path: 1 }, { unique: true });

export const FileNode = model<IFileNode>('FileNode', FileNodeSchema);
