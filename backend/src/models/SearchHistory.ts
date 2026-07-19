import { Schema, model, Document } from 'mongoose';

export interface ISearchHistory extends Document {
  project: Schema.Types.ObjectId;
  query: string;
  user: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SearchHistorySchema = new Schema<ISearchHistory>(
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
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const SearchHistory = model<ISearchHistory>('SearchHistory', SearchHistorySchema);
