import { Request, Response, NextFunction } from 'express';
import { discordAuthService } from '../services/discordAuth.service.js';
import { isPlatformOwner } from '../security/rbac.js';
import { BadRequestError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { ALL_COMMUNITY_PERMISSIONS } from '../../shared/types/rbac.js';
import {
  communitiesRepository,
  communityMemberAccessRepository,
  auditLogsRepository,
  oauthStatesRepository,
  usersRepository,
  sessionsRepository,
  discordSessionRepository,
  discordOAuthStateRepository,
} from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import crypto from 'crypto';

export interface OAuthStepTrace {
  step: 'STATE_VALIDATION' | 'PKCE_VERIFICATION' | 'CODE_EXCHANGE' | 'USER_FETCH' | 'SESSION_PERSISTENCE';
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  timestamp: string;
  durationMs?: number;
  details?: Record<string, any>;
  error?: string;
}

export interface OAuthFlowTrace {
  traceId: string;
  timestamp: string;
  clientIp?: string;
  userAgent?: string;
  requestOrigin?: string;
  params: {
    hasCode: boolean;
    codePreview?: string;
    hasState: boolean;
    state?: string;
    hasError: boolean;
    error?: string;
    errorDescription?: string;
  };
  cookies: {
    hasStateCookie: boolean;
    cookieStateMatches: boolean;
    hasVerifierCookie: boolean;
    hasExistingSession: boolean;
  };
  steps: OAuthStepTrace[];
  finalStatus: 'SUCCESS' | 'FAILED';
  failedAtStep?: string;
  failureReason?: string;
  resolvedUser?: {
    id: string;
    username: string;
    discriminator: string;
    email?: string;
  };
  sessionCreated?: boolean;
}

// Thread-safe in-memory ring buffer for recent OAuth diagnostic traces
const MAX_TRACES = 50;
const recentOAuthTraces: OAuthFlowTrace[] = [];

export function recordOAuthTrace(trace: OAuthFlowTrace) {
  recentOAuthTraces.unshift(trace);
  if (recentOAuthTraces.length > MAX_TRACES) {
    recentOAuthTraces.pop();
  }
}

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';').reduce((acc, current) => {
    const [key, ...val] = current.trim().split('=');
    acc[key] = val.join('=');
    return acc;
  }, {} as Record<string, string>);
  return cookies[name];
}

export async function authLogin(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Generate secure cryptographically random state (32 bytes hex)
    const state = crypto.randomBytes(32).toString('hex');

    const redirectUri = typeof req.query.redirectUri === 'string' ? req.query.redirectUri : undefined;
    let returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;

    // Embed onboarding context in state so callback knows where to return the user
    const fromOnboarding = req.query.from === 'onboarding' || Boolean(req.header('referer')?.includes('onboarding'));
    const stateWithHint = fromOnboarding ? `${state}:onboarding` : state;
    let url = discordAuthService.getOAuthUrl(stateWithHint, redirectUri);

    // "Add bot" flow: same sign-in, plus the bot install. Discord then comes back to our callback,
    // and the user lands on the server picker with that server ready to set up (no dead-end page).
    if (req.query.install === '1') {
      const guildId = typeof req.query.guildId === 'string' && /^\d{15,21}$/.test(req.query.guildId) ? req.query.guildId : undefined;
      const { AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } = await import('../services/discordPermissionEngine.service.js');
      const u = new URL(url);
      u.searchParams.set('scope', 'identify guilds bot applications.commands');
      u.searchParams.set('permissions', AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD);
      if (guildId) { u.searchParams.set('guild_id', guildId); u.searchParams.set('disable_guild_select', 'true'); }
      url = u.toString();
      returnTo = `/servers?installed=${guildId || '1'}`;
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiration

    // 3. Persist OAuth state in database
    try {
      const dummyVerifier = crypto.randomBytes(16).toString('hex');
      await discordOAuthStateRepository.createState(stateWithHint, dummyVerifier, 10 * 60 * 1000, redirectUri, returnTo);
      await oauthStatesRepository.create({
        id: stateWithHint,
        expiresAt,
        consumed: false
      });
    } catch (dbErr) {
      logger.error(`[DiscordOAuthDiagnostic] Failed persisting OAuth state in database: ${(dbErr as Error).message}`);
      throw dbErr;
    }

    logger.info(`[DiscordOAuthDiagnostic] Generated OAuth Login URL for state=${stateWithHint.substring(0, 8)}... redirectUri=${redirectUri || 'default'}`);

    // 4. Store state in secure HttpOnly cookie for CSRF protection
    const isProdOrPreview = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW' || config.APP_RUNTIME_MODE === 'PRODUCTION';
    res.cookie('oauth_state', stateWithHint, {
      httpOnly: true,
      secure: isProdOrPreview,
      sameSite: 'lax',
      maxAge: 300000,
      path: '/',
    });

    // 5. Check if client requested direct browser redirect vs JSON API payload
    const wantsRedirect =
      req.query.redirect === 'true' ||
      (req.headers.accept && req.headers.accept.includes('text/html') && !req.headers.accept.includes('application/json'));

    if (wantsRedirect) {
      return res.redirect(url);
    }

    res.json({
      success: true,
      data: {
        authorizationUrl: url,
        state: stateWithHint,
        scopes: ['identify', 'guilds'],
      },
      requestId: req.id,
    });
  } catch (error) {
    logger.error(`[DiscordOAuthDiagnostic] authLogin failed: ${(error as Error).message}`);
    next(error);
  }
}

export async function authCallback(req: Request, res: Response, next: NextFunction) {
  const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startTime = Date.now();

  const { code, state, error: oauthError, error_description } = req.query;
  const cookieState = getCookie(req, 'oauth_state');
  const existingSession = getCookie(req, 'discord_session_token');

  const trace: OAuthFlowTrace = {
    traceId,
    timestamp: new Date().toISOString(),
    clientIp: req.ip || (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'],
    requestOrigin: req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined),
    params: {
      hasCode: Boolean(code),
      codePreview: typeof code === 'string' ? `${code.substring(0, 6)}...` : undefined,
      hasState: Boolean(state),
      state: typeof state === 'string' ? state : undefined,
      hasError: Boolean(oauthError),
      error: typeof oauthError === 'string' ? oauthError : undefined,
      errorDescription: typeof error_description === 'string' ? error_description : undefined,
    },
    cookies: {
      hasStateCookie: Boolean(cookieState),
      cookieStateMatches: Boolean(cookieState && state && cookieState === state),
      hasVerifierCookie: false,
      hasExistingSession: Boolean(existingSession),
    },
    steps: [],
    finalStatus: 'FAILED',
  };

  const logStep = (
    step: OAuthStepTrace['step'],
    status: OAuthStepTrace['status'],
    details?: Record<string, any>,
    error?: string,
    durationMs?: number
  ) => {
    const stepRecord: OAuthStepTrace = {
      step,
      status,
      timestamp: new Date().toISOString(),
      durationMs,
      details,
      error,
    };
    trace.steps.push(stepRecord);
    if (status === 'FAILED') {
      trace.failedAtStep = step;
      trace.failureReason = error || 'Step failed without explicit error';
      logger.error(`[DiscordOAuthDiagnostic][${traceId}] ❌ Step ${step} FAILED: ${error} | details=${JSON.stringify(details || {})}`);
    } else {
      logger.info(`[DiscordOAuthDiagnostic][${traceId}] ✅ Step ${step} SUCCESS (${durationMs || 0}ms)`);
    }
  };

  try {
    // 0. Check for explicit OAuth error from Discord (e.g. user clicked Cancel)
    if (oauthError) {
      const errorMsg = String(error_description || oauthError);
      logStep('STATE_VALIDATION', 'FAILED', { oauthError, error_description }, `Discord returned OAuth error: ${errorMsg}`);
      recordOAuthTrace(trace);
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Cancelled</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #334155;">
            <div style="text-align: center; max-width: 420px; padding: 24px; border-radius: 12px; background: white; border: 1px solid #fee2e2; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <div style="width: 48px; height: 48px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg style="width: 24px; height: 24px; color: #dc2626;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 style="color: #dc2626; margin: 0 0 8px; font-size: 18px;">Authentication Cancelled</h2>
              <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 16px;">${errorMsg}</p>
              <button onclick="window.close()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'DISCORD_AUTH_ERROR', error: ${JSON.stringify(errorMsg)} }, window.location.origin);
                  setTimeout(() => window.close(), 1500);
                }
              } catch (e) {
                console.error(e);
              }
            </script>
          </body>
        </html>
      `);
    }

    if (!code || typeof code !== 'string') {
      logStep('CODE_EXCHANGE', 'FAILED', { query: req.query }, 'Missing authorization code parameter');
      recordOAuthTrace(trace);
      throw new BadRequestError('Missing authorization code from Discord OAuth callback');
    }

    if (!state || typeof state !== 'string') {
      logStep('STATE_VALIDATION', 'FAILED', { query: req.query }, 'Missing state parameter from Discord callback');
      recordOAuthTrace(trace);
      throw new BadRequestError('Missing state parameter from Discord OAuth callback');
    }

    // Step 1: STATE_VALIDATION
    const step1Start = Date.now();
    if (cookieState && cookieState !== state) {
      logStep('STATE_VALIDATION', 'FAILED', { state, cookieState }, 'CSRF state token mismatch between query param and session cookie');
      recordOAuthTrace(trace);
      throw new BadRequestError('CSRF state verification failed: State token mismatch with session cookie.');
    }

    const stateRecord = await discordOAuthStateRepository.getByState(state);
    if (!stateRecord) {
      logStep('STATE_VALIDATION', 'FAILED', { state }, 'State record not found in discordOAuthStates (invalid or expired token)');
      recordOAuthTrace(trace);
      throw new BadRequestError('CSRF state verification failed: State token is invalid or expired.');
    }

    if (stateRecord.consumedAt) {
      logStep('STATE_VALIDATION', 'FAILED', { state, consumedAt: stateRecord.consumedAt }, 'Replay attack prevented: State record has already been consumed');
      recordOAuthTrace(trace);
      throw new BadRequestError('CSRF state verification failed: State token has already been consumed.');
    }

    const expiresMillis = typeof (stateRecord.expiresAt as any)?.toMillis === 'function'
      ? (stateRecord.expiresAt as any).toMillis()
      : typeof (stateRecord.expiresAt as any)?._seconds === 'number'
      ? (stateRecord.expiresAt as any)._seconds * 1000
      : new Date(stateRecord.expiresAt as any).getTime();

    if (expiresMillis < Date.now()) {
      logStep('STATE_VALIDATION', 'FAILED', { state, expiresAt: stateRecord.expiresAt }, 'State record expired');
      recordOAuthTrace(trace);
      throw new BadRequestError('CSRF state verification failed: State token has expired.');
    }

    // Mark state consumed immediately (atomic replay prevention)
    await discordOAuthStateRepository.consumeState(state);
    logStep('STATE_VALIDATION', 'SUCCESS', { stateId: state.substring(0, 8), returnTo: stateRecord.returnTo }, undefined, Date.now() - step1Start);

    // Step 2: PKCE_VERIFICATION
    logStep('PKCE_VERIFICATION', 'SUCCESS', { note: 'Skipped — Discord does not support PKCE' }, undefined, 0);

    // Step 3: CODE_EXCHANGE
    const step3Start = Date.now();
    let tokenData: { accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] };
    try {
      tokenData = await discordAuthService.exchangeCodeForToken(code, stateRecord.redirectUri);
      logStep('CODE_EXCHANGE', 'SUCCESS', {
        scopes: tokenData.scopes,
        expiresInSeconds: Math.round((tokenData.expiresAt - Date.now()) / 1000),
        hasRefreshToken: Boolean(tokenData.refreshToken),
      }, undefined, Date.now() - step3Start);
    } catch (err) {
      const errMsg = (err as Error).message;
      logStep('CODE_EXCHANGE', 'FAILED', { redirectUri: stateRecord.redirectUri, error: errMsg }, `Discord Token Exchange failed: ${errMsg}`, Date.now() - step3Start);
      recordOAuthTrace(trace);
      throw err;
    }

    // Step 4: USER_FETCH
    const step4Start = Date.now();
    let userProfile: any;
    let userGuilds: any[];
    try {
      userProfile = await discordAuthService.getDiscordUser(tokenData.accessToken);
      userGuilds = await discordAuthService.getDiscordUserGuilds(tokenData.accessToken);
      trace.resolvedUser = {
        id: userProfile.id,
        username: userProfile.username,
        discriminator: userProfile.discriminator,
        email: userProfile.email,
      };
      logStep('USER_FETCH', 'SUCCESS', {
        userId: userProfile.id,
        username: `${userProfile.username}#${userProfile.discriminator}`,
        email: userProfile.email ? `${userProfile.email.substring(0, 3)}***` : undefined,
        guildCount: userGuilds.length,
      }, undefined, Date.now() - step4Start);
    } catch (err) {
      const errMsg = (err as Error).message;
      logStep('USER_FETCH', 'FAILED', { error: errMsg }, `Discord User Profile fetch failed: ${errMsg}`, Date.now() - step4Start);
      recordOAuthTrace(trace);
      throw err;
    }

    // Step 5: SESSION_PERSISTENCE
    const step5Start = Date.now();
    const isPlatformAdmin =
      (config.PLATFORM_OWNER_EMAIL &&
        userProfile.email &&
        userProfile.email.trim().toLowerCase() === config.PLATFORM_OWNER_EMAIL.trim().toLowerCase()) ||
      (config.PLATFORM_OWNER_USER_ID &&
        userProfile.id === config.PLATFORM_OWNER_USER_ID);

    const now = new Date().toISOString();

    try {
      // 5a. Create or update persistent User record
      const existingUser = await usersRepository.getById(userProfile.id);
      if (existingUser) {
        await usersRepository.update(userProfile.id, {
          ...existingUser,
          username: userProfile.username,
          discriminator: userProfile.discriminator,
          avatarUrl: userProfile.avatar
            ? `https://cdn.discordapp.com/avatars/${userProfile.id}/${userProfile.avatar}.png`
            : undefined,
          email: userProfile.email || existingUser.email,
          lastLoginAt: now,
        });
      } else {
        await usersRepository.create({
          id: userProfile.id,
          discordId: userProfile.id,
          username: userProfile.username,
          discriminator: userProfile.discriminator,
          avatarUrl: userProfile.avatar
            ? `https://cdn.discordapp.com/avatars/${userProfile.id}/${userProfile.avatar}.png`
            : undefined,
          email: userProfile.email,
          globalRole: isPlatformAdmin ? 'PLATFORM_OWNER' : 'APPLICANT',
          createdAt: now,
          lastLoginAt: now,
        });
      }

      // 5b. Persist web session records in the database
      const sessionToken = await discordAuthService.saveSession({
        discordUserId: userProfile.id,
        username: userProfile.username,
        globalName: userProfile.global_name,
        avatar: userProfile.avatar,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        scopes: tokenData.scopes,
        authenticatedAt: now,
        guilds: userGuilds.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          owner: g.owner,
          permissions: g.permissions,
        })),
      });

      // 5c. Write secure HttpOnly session cookie (discord_session_token) for persistent web session
      const isProdOrPreview = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW' || config.APP_RUNTIME_MODE === 'PRODUCTION';
      res.cookie('discord_session_token', sessionToken, {
        httpOnly: true,
        secure: isProdOrPreview,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      // After setting the session cookie, redirect based on context
      // After login, people choose which server to manage (or resume a page they were sent away from).
      const safeReturnTo = typeof stateRecord?.returnTo === 'string' && stateRecord.returnTo.startsWith('/') && !stateRecord.returnTo.startsWith('//') ? stateRecord.returnTo : undefined;
      const postAuthRedirect = req.query.postAuth === 'onboarding' ? '/dashboard?view=onboarding' : (safeReturnTo || '/servers');
      const redirectUrl_postAuth = postAuthRedirect;

      // Clear temporary OAuth state cookie
      res.clearCookie('oauth_state', { path: '/', sameSite: 'lax', secure: isProdOrPreview });

      // 5d. Enforce dynamic ownership & admin role transfer checks across user's Discord guilds
      for (const g of userGuilds) {
        let isGuildAdminOrOwner = Boolean(g.owner);
        try {
          if (!isGuildAdminOrOwner && g.permissions) {
            isGuildAdminOrOwner = (BigInt(g.permissions) & 0x8n) === 0x8n;
          }
        } catch {
          // ignore parsing error
        }

        if (isGuildAdminOrOwner) {
          const commId = `comm_${g.id}`;
          const existingComms = await communitiesRepository.list({
            where: [{ field: 'guildId', operator: '==', value: g.id }],
          });

          if (existingComms.length === 0) {
            // Auto-provision community document for owner/admin guild
            try {
              await communitiesRepository.create({
                id: commId,
                name: g.name || `Discord Server ${g.id}`,
                guildId: g.id,
                discordGuildId: g.id,
                ownerUserId: userProfile.id,
                verifiedOwnerDiscordUserId: userProfile.id,
                isActive: true,
                setupStatus: 'COMPLETED',
                icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : undefined,
                createdAt: now,
                updatedAt: now,
              } as any);

              const accessId = `${commId}_${userProfile.id}`;
              await communityMemberAccessRepository.create({
                id: accessId,
                communityId: commId,
                discordUserId: userProfile.id,
                role: 'OWNER',
                permissions: [...ALL_COMMUNITY_PERMISSIONS],
                source: 'DISCORD_GUILD_OWNER',
                createdAt: now,
                updatedAt: now,
              });
            } catch (createErr) {
              logger.warn(`Failed auto-provisioning community for guild ${g.id}: ${(createErr as Error).message}`);
            }
          } else {
            for (const community of existingComms) {
              if (community.ownerUserId !== userProfile.id && g.owner) {
                const oldOwnerId = community.ownerUserId;
                await communitiesRepository.update(community.id, {
                  ...community,
                  ownerUserId: userProfile.id,
                  verifiedOwnerDiscordUserId: userProfile.id,
                  updatedAt: now,
                });

                await auditLogsRepository.create({
                  id: `audit_owner_trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  communityId: community.id,
                  actorUserId: userProfile.id,
                  actorRole: 'OWNER',
                  action: 'USER_ROLE_CHANGED',
                  targetType: 'USER',
                  targetId: oldOwnerId,
                  metadata: {
                    event: 'OWNERSHIP_TRANSFERRED',
                    previousOwnerId: oldOwnerId,
                    newOwnerId: userProfile.id,
                    reason: 'Discord guild owner change detected',
                  },
                  timestamp: now,
                });
              }

              const accessId = `${community.id}_${userProfile.id}`;
              const currentAccess = await communityMemberAccessRepository.getById(accessId);
              if (!currentAccess || currentAccess.role !== 'OWNER') {
                await communityMemberAccessRepository.create({
                  id: accessId,
                  communityId: community.id,
                  discordUserId: userProfile.id,
                  role: 'OWNER',
                  permissions: [...ALL_COMMUNITY_PERMISSIONS],
                  source: 'DISCORD_GUILD_OWNER',
                  createdAt: now,
                  updatedAt: now,
                });
              }
            }
          }
        }
      }

      logStep('SESSION_PERSISTENCE', 'SUCCESS', {
        userId: userProfile.id,
        isPlatformAdmin,
        sessionSaved: true,
      }, undefined, Date.now() - step5Start);

      trace.finalStatus = 'SUCCESS';
      trace.sessionCreated = true;
      recordOAuthTrace(trace);

      logger.info(`[DiscordOAuthDiagnostic][${traceId}] 🚀 OAuth Flow COMPLETE in ${Date.now() - startTime}ms for Discord User @${userProfile.username} (${userProfile.id})`);

      // Return user to onboarding if that is where they came from
      const stateStr = typeof state === 'string' ? state : '';
      const redirectUrl = stateStr.includes(':onboarding') ? '/dashboard?view=onboarding' : postAuthRedirect;

      // HTML response notifying window.opener
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Complete</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #334155;">
            <div style="text-align: center; max-width: 400px; padding: 24px; border-radius: 12px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <div style="width: 48px; height: 48px; background: #e0e7ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg style="width: 24px; height: 24px; color: #4f46e5;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 style="color: #4f46e5; margin: 0 0 8px; font-size: 20px;">Authentication Complete</h2>
              <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 16px;">You have successfully authenticated as <strong>${userProfile.username}</strong>. This window will now close.</p>
            </div>
            <script>
              try {
                const payload = {
                  success: true,
                  user: {
                    discordUserId: ${JSON.stringify(userProfile.id)},
                    username: ${JSON.stringify(userProfile.username)},
                    globalName: ${JSON.stringify(userProfile.global_name)},
                    email: ${JSON.stringify(userProfile.email)},
                    avatar: ${JSON.stringify(userProfile.avatar)},
                    isPlatformOwner: ${Boolean(isPlatformAdmin)},
                  },
                  authenticatedAt: ${JSON.stringify(now)}
                };
                
                if (window.opener) {
                  window.opener.postMessage({ type: 'DISCORD_AUTH_SUCCESS', payload }, window.location.origin);
                  setTimeout(() => window.close(), 150);
                } else {
                  window.location.href = ${JSON.stringify(redirectUrl)};
                }
              } catch (err) {
                console.error('Popup message transmission error:', err);
                window.location.href = ${JSON.stringify(redirectUrl)};
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      const errMsg = (err as Error).message;
      logStep('SESSION_PERSISTENCE', 'FAILED', { error: errMsg }, `Session/User persistence failed: ${errMsg}`, Date.now() - step5Start);
      recordOAuthTrace(trace);
      throw err;
    }
  } catch (error) {
    logger.error(`[DiscordOAuthDiagnostic][${traceId}] 💥 Top-level authCallback failure: ${(error as Error).message}`);
    next(error);
  }
}

export async function authLogout(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header('authorization');
    const token =
      getCookie(req, 'discord_session_token') ||
      (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined);

    if (token) {
      const session = await discordAuthService.getSessionByToken(token);
      if (session?.accessToken) {
        await discordAuthService.revokeOAuthToken(session.accessToken);
      }
      await discordAuthService.deleteSession(token);
    }

    const isProdOrPreview = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW' || config.APP_RUNTIME_MODE === 'PRODUCTION';
    res.clearCookie('discord_session_token', { path: '/', sameSite: 'lax', secure: isProdOrPreview });
    res.clearCookie('oauth_state', { path: '/', sameSite: 'lax', secure: isProdOrPreview });

    res.json({
      success: true,
      message: 'Logged out successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

const profileCache = new Map<string, { at: number; p: any }>();
async function discordProfile(userId: string) {
  const id = String(userId || '').replace(/^usr_/, '');
  if (!/^\d{15,21}$/.test(id)) return null;
  const hit = profileCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  try {
    const { discordService } = await import('../integrations/discord/discord.service.js');
    const u: any = await (discordService as any).client?.users?.fetch(id);
    const p = u ? { username: u.globalName || u.username, discordUsername: u.username, avatarUrl: u.displayAvatarURL({ size: 128 }) } : null;
    profileCache.set(id, { at: Date.now(), p });
    return p;
  } catch { return null; }
}

export async function getAuthSession(req: Request, res: Response) {
  const user = req.user || {
    userId: 'usr_guest',
    role: 'APPLICANT',
  };

  const isAuthenticated = Boolean(
    req.user &&
      req.user.userId &&
      req.user.userId !== 'usr_anonymous' &&
      req.user.userId !== 'usr_guest' &&
      !req.user.userId.startsWith('usr_simulated_')
  );

  const profile = isAuthenticated ? await discordProfile(String((user as any).discordUserId || user.userId)) : null;
  res.json({
    success: true,
    data: {
      user: {
        ...user,
        ...(profile || {}),
        isPlatformOwner: isPlatformOwner(req.user),
      },
      runtimeMode: config.APP_RUNTIME_MODE,
      devSimulationEnabled: false, // Fully disabled - enforcing real OAuth credentials
      authenticated: isAuthenticated,
      authenticatedAt: new Date().toISOString(),
    },
    requestId: req.id,
  });
}

/**
 * Diagnostic handler to inspect the Discord OAuth callback flow, configuration,
 * and step-by-step trace logs of recent callback attempts.
 */
export async function getAuthDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    const clientSecret = config.DISCORD_CLIENT_SECRET;
    const redirectUri = config.DISCORD_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/callback`;

    // Fetch live stats from repositories
    let activeStatesCount = 0;
    let consumedStatesCount = 0;
    let totalSessionsCount = 0;
    let totalUsersCount = 0;

    try {
      const allStates = await oauthStatesRepository.list({});
      activeStatesCount = allStates.filter((s) => !s.consumed && new Date(s.expiresAt).getTime() > Date.now()).length;
      consumedStatesCount = allStates.filter((s) => s.consumed).length;
    } catch {
      // Non-blocking
    }

    try {
      const sessions = await sessionsRepository.list({});
      totalSessionsCount = sessions.length;
    } catch {
      // Non-blocking
    }

    try {
      const users = await usersRepository.list({});
      totalUsersCount = users.length;
    } catch {
      // Non-blocking
    }

    const totalAttempts = recentOAuthTraces.length;
    const successfulAttempts = recentOAuthTraces.filter((t) => t.finalStatus === 'SUCCESS').length;
    const failedAttempts = recentOAuthTraces.filter((t) => t.finalStatus === 'FAILED').length;

    const failureByStep: Record<string, number> = {};
    for (const t of recentOAuthTraces) {
      if (t.finalStatus === 'FAILED' && t.failedAtStep) {
        failureByStep[t.failedAtStep] = (failureByStep[t.failedAtStep] || 0) + 1;
      }
    }

    const configAudit = {
      clientIdConfigured: Boolean(clientId),
      clientIdMasked: clientId ? `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}` : null,
      clientSecretConfigured: Boolean(clientSecret),
      clientSecretLength: clientSecret ? clientSecret.length : 0,
      redirectUri,
      appUrl: config.APP_URL,
      platformOwnerEmailConfigured: Boolean(config.PLATFORM_OWNER_EMAIL),
      platformOwnerUserIdConfigured: Boolean(config.PLATFORM_OWNER_USER_ID),
      pkceEnforced: false,
      simulationBypassAllowed: false,
    };

    res.json({
      success: true,
      data: {
        summary: {
          totalTracedFlows: totalAttempts,
          successfulFlows: successfulAttempts,
          failedFlows: failedAttempts,
          successRate: totalAttempts > 0 ? `${Math.round((successfulAttempts / totalAttempts) * 100)}%` : 'N/A',
          failureByStep,
        },
        databaseStats: {
          activePendingOAuthStates: activeStatesCount,
          consumedOAuthStates: consumedStatesCount,
          persistedSessions: totalSessionsCount,
          persistedUsers: totalUsersCount,
        },
        config: configAudit,
        recentTraces: recentOAuthTraces,
        recommendations: [
          !configAudit.clientIdConfigured && 'Configure DISCORD_CLIENT_ID in your environment.',
          !configAudit.clientSecretConfigured && 'Configure DISCORD_CLIENT_SECRET in your environment.',
          `Ensure '${redirectUri}' is added to Discord Developer Portal under OAuth2 > Redirects.`,
          'Server-side state validation and HttpOnly cookie CSRF protection enabled.',
          'Simulation bypass has been removed; authenticated identity is bound to Discord REST APIs.',
        ].filter(Boolean),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}


