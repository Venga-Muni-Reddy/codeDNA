import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import { authRouter } from './routes/auth';
import { projectRouter } from './routes/project';
import { errorHandler } from './middlewares/errorHandler';

const envPath = path.resolve(__dirname, '..', '.env');
const dotenvResult = dotenv.config({ path: envPath });
console.log("[dotenv]: Attempting to load from:", envPath);
if (dotenvResult.error) {
  console.error("[dotenv] Error:", dotenvResult.error.message);
} else {
  console.log("[dotenv]: Loaded variables successfully:", Object.keys(dotenvResult.parsed || {}));
}

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/codeatlas';
console.log("Mongo URI : ", MONGO_URI)
// Security middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP for easy SVG/Mermaid inline rendering during demos
}));
app.use(cors());
app.use(express.json());

// Main authentication endpoints
app.use('/api/auth', authRouter);

// Main project ingestion endpoints
app.use('/api/projects', projectRouter);

// Basic health check route
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'CodeAtlas AI Backend is active and running',
    data: {
      timestamp: new Date(),
    },
    errors: null,
    meta: {},
  });
});

// Serve frontend static assets in production
const frontendDistPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Global error handler
app.use(errorHandler);

const startServer = async () => {
  try {
    // Database connection
    await connectDB(MONGO_URI);

    app.listen(PORT, () => {
      console.log(`[server]: Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
