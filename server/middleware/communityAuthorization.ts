import { Request, Response, NextFunction } from 'express';
import { requireTenantAccess } from './auth.js';

export const communityAuthorization = requireTenantAccess;
export const requireCommunityAuthorization = requireTenantAccess;
export default communityAuthorization;
