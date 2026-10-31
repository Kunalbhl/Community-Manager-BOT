import { Request, Response, NextFunction } from 'express';
import { authenticate as baseAuthenticate } from './auth.js';

export const authenticate = baseAuthenticate;
export default authenticate;
