import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/errors.js';

export function validateRequiredFields(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object') {
      return next(new BadRequestError('Request body must be a valid JSON object'));
    }

    const missing = fields.filter((field) => req.body[field] === undefined || req.body[field] === null || req.body[field] === '');
    if (missing.length > 0) {
      return next(
        new BadRequestError(`Missing required fields: ${missing.join(', ')}`, 'VALIDATION_ERROR', {
          missingFields: missing,
        })
      );
    }

    next();
  };
}
