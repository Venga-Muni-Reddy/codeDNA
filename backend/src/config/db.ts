import mongoose from 'mongoose';

export const connectDB = async (mongoUri: string): Promise<typeof mongoose> => {
  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${(error as Error).message}`);
    process.exit(1);
  }
};
