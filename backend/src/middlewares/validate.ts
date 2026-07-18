import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation Error',
          data: {},
          errors: error.errors.map((err) => ({
            field: err.path.slice(1).join('.'),
            message: err.message,
          })),
          meta: {},
        });
        return;
      }
      next(error);
    }
  };
};
