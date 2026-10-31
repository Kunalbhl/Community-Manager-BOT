import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

/**
 * Production Security Headers and Middleware
 */
export function httpSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Fundamental Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 2. Content Security Policy (allows Discord OAuth, Google Firestore, fonts, and API requests)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.firebaseio.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob: https://cdn.discordapp.com",
    "connect-src 'self' https: wss: https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com",
    "frame-ancestors 'self' https://*.google.com https://*.studio.google https://*.google.com:* https://localhost.corp.google.com:*",
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  next();
}

/**
 * Secure Cookie Options Generator
 */
export function getSecureCookieOptions(maxAgeMs = 86400000) {
  const isProdOrPreview = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW' || config.APP_RUNTIME_MODE === 'PRODUCTION';
  return {
    httpOnly: true,
    secure: isProdOrPreview,
    sameSite: (isProdOrPreview ? 'none' : 'lax') as 'lax' | 'strict' | 'none',
    maxAge: maxAgeMs,
    path: '/',
  };
}
