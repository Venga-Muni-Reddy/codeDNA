import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: 'owner' | 'collaborator' | 'viewer';
  refreshTokens: string[];
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'collaborator', 'viewer'],
      default: 'owner',
    },
    refreshTokens: {
      type: [String],
      default: [],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const userJson = ret as any;
    delete userJson.passwordHash;
    delete userJson.refreshTokens;
    delete userJson.verificationToken;
    delete userJson.resetPasswordToken;
    delete userJson.resetPasswordExpires;
    return userJson;
  },
});

export const User = model<IUser>('User', UserSchema);
