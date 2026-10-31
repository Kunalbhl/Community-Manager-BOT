import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header('x-request-id');
  const id = incomingId && incomingId.length <= 64 ? incomingId : randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
