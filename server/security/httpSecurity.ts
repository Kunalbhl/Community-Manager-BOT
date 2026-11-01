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

  // 2. Content Security Policy: only our own code runs; nobody else may frame the app (clickjacking).
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://discord.com https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

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
    sameSite: 'lax' as 'lax' | 'strict' | 'none',
    maxAge: maxAgeMs,
    path: '/',
  };
}

/**
 * CSRF guard: state-changing API requests must come from our own pages.
 * Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE, so a forged request from another
 * website is rejected. Server-to-server calls (no Origin) and Discord/Stripe webhooks are unaffected.
 */
export function sameOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.header('origin');
  if (!origin) return next();
  const allowed = new Set<string>();
  const add = (u?: string) => { try { if (u) allowed.add(new URL(u).origin); } catch { /* ignore */ } };
  add(config.APP_URL);
  add(process.env.LEADER_API_URL);
  const fwdHost = req.header('x-forwarded-host');
  if (fwdHost) allowed.add(`https://${fwdHost}`);
  if (req.header('host')) { allowed.add(`https://${req.header('host')}`); allowed.add(`http://${req.header('host')}`); }
  if (allowed.has(origin)) return next();
  res.status(403).json({ success: false, code: 'CROSS_SITE_REQUEST_BLOCKED', message: 'This request did not come from the Community Manager website.' });
}
