import { Schema, model, Document } from 'mongoose';

export interface IProject extends Document {
  owner: Schema.Types.ObjectId;
  name: string;
  sourceType: 'github' | 'zip' | 'local';
  repoUrl?: string;
  localPath?: string;
  branch: string;
  currentCommit?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  techStack: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ['github', 'zip', 'local'],
      required: true,
    },
    repoUrl: {
      type: String,
      trim: true,
    },
    localPath: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      default: 'main',
    },
    currentCommit: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    errorMessage: {
      type: String,
    },
    techStack: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Project = model<IProject>('Project', ProjectSchema);
