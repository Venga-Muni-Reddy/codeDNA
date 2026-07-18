import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: any = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === 'ValidationError') {
    // Mongoose validation errors
    statusCode = 400;
    message = 'Validation Error';
    errors = (err as any).errors;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your token has expired. Please log in again.';
  } else {
    // Log unexpected errors
    console.error('[Unhandled Error]:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    data: {},
    errors: errors || err.message || null,
    meta: {},
  });
};
