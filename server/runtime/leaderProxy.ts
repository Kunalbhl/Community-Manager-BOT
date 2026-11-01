/**
 * "The API follows the active bot."
 *
 * Only the leader (normally the Oracle VM) holds the live Discord gateway connection, and ~100
 * server code paths (channel/role pickers, sending messages, member data, automations) need it.
 * The website on Cloud Run is a standby, so while it is NOT the leader it forwards every /api request
 * to the leader over HTTPS (LEADER_API_URL). If the leader cannot be reached, the request is handled
 * locally, and the lease makes this instance the leader within about a minute.
 */
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { logger } from '../logging/logger.js';
import { getLeadershipStatus } from './leadership.js';

const PROXY_MARK = 'x-cm-proxied';
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);
let upstreamDownUntil = 0;

export function leaderProxy() {
  const target = (process.env.LEADER_API_URL || '').trim().replace(/\/$/, '');
  if (!target) return (_req: Request, _res: Response, next: NextFunction) => next();
  const base = new URL(target);
  const client = base.protocol === 'https:' ? https : http;
  const agent = new client.Agent({ keepAlive: true, maxSockets: 32 });
  logger.info(`[LeaderProxy] Standby API requests will be forwarded to ${base.origin}`);

  return (req: Request, res: Response, next: NextFunction) => {
    const status = getLeadershipStatus();
    if (status.isLeader || req.headers[PROXY_MARK] || Date.now() < upstreamDownUntil) return next();

    const headers: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
    headers[PROXY_MARK] = '1';
    headers['x-forwarded-host'] = req.headers.host;
    headers['x-forwarded-proto'] = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    headers['x-forwarded-for'] = req.ip;

    const proxyReq = client.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || (base.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: req.originalUrl,
        headers,
        agent,
        timeout: 25000,
      },
      (proxyRes) => {
        const outHeaders: Record<string, any> = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v;
        res.writeHead(proxyRes.statusCode || 502, outHeaders);
        proxyRes.pipe(res);
      },
    );

    let failed = false;
    const fail = (err: Error) => {
      if (failed) return;
      failed = true;
      upstreamDownUntil = Date.now() + 30000;
      logger.warn(`[LeaderProxy] Leader unreachable (${err.message}); serving locally for 30s.`);
      if (!res.headersSent && !(req as any).__bodyConsumed) return next();
      if (!res.headersSent) res.status(503).json({ success: false, code: 'LEADER_UNAVAILABLE', message: 'The bot is restarting. Please retry in a moment.' });
      else res.end();
    };
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('timeout')));
    proxyReq.on('error', fail);
    req.on('data', () => { (req as any).__bodyConsumed = true; });
    req.pipe(proxyReq);
  };
}
