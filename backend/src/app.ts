import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { authRouter } from './routes/auth';
import { projectRouter } from './routes/project';
import { featuresRouter } from './routes/features';
import { impactRouter } from './routes/impact';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = express();

// Security middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP for easy SVG/Mermaid inline rendering during demos
}));

// Production-ready CORS Configuration
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim().replace(/\/$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman, or same-origin)
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.includes(origin) ||
      (env.NODE_ENV === 'development' && origin.startsWith('http://localhost:'));

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`[CORS]: Request blocked from origin: ${origin}`);
      callback(new Error('Blocked by CORS policy (Origin not allowed)'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Main authentication endpoints
app.use('/api/auth', authRouter);

// Main project ingestion endpoints
app.use('/api/projects', projectRouter);

// Main features endpoints
app.use('/api/features', featuresRouter);

// Main impact endpoints
app.use('/api/impact', impactRouter);

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

export default app;
export { app };
