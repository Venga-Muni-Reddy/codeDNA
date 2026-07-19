import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDB } from './config/db';
import { app } from './app';

const startServer = async () => {
  try {
    // Database connection
    await connectDB(env.MONGO_URI);

    app.listen(env.PORT, () => {
      logger.info(`[server]: Server is running in ${env.NODE_ENV} mode at http://localhost:${env.PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
