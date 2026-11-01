import { calendarAvailable, calendarIsReal, CALENDAR_NOT_CONFIGURED_MESSAGE } from './availability.js';
import { signState, buildAuthorizeUrl, encrypt, decrypt, refreshAccessToken, calendarApi, logGoogleError, GoogleTokens } from './googleApi.js';
import { logger } from '../../logging/logger.js';
import { config } from '../../config/env.js';
import {
  interviewsRepository,
  googleCalendarConfigsRepository,
  userCalendarConfigsRepository,
  integrationEventsRepository,
  auditLogsRepository,
} from '../../repositories/index.js';
import { GoogleCalendarConfig, UserCalendarConfigDocument } from '../../../shared/types/models.js';

export interface CalendarEventResult {
  eventId?: string;
  htmlLink?: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'CALENDAR_NOT_CONNECTED' | 'CALENDAR_REQUIRED';
  summary?: string;
  start?: string;
  end?: string;
  timezone?: string;
  isDuplicate?: boolean;
  message?: string;
}

export class GoogleCalendarService {
  isEligibleRole(role: string): boolean {
    if (!role) return false;
    const normalized = role.toUpperCase();
    return (
      normalized === 'SERVER_OWNER' ||
      normalized === 'OWNER' ||
      normalized === 'CONTROLLER' ||
      normalized === 'INTERVIEWER'
    );
  }

  async getUserCalendarConfig(userId: string): Promise<UserCalendarConfigDocument | null> {
    if (!userId) return null;
    try {
      const byId = await userCalendarConfigsRepository.getById(userId);
      if (byId) return byId;
      const byCalId = await userCalendarConfigsRepository.getById(`cal_usr_${userId}`);
      if (byCalId) return byCalId;
      const configs = await userCalendarConfigsRepository.list({
        where: [{ field: 'userId', operator: '==', value: userId }],
        limit: 1,
      });
      if (configs && configs.length > 0) {
        return configs[0];
      }
    } catch (err: any) {
      logger.warn(`[GoogleCalendarService] Failed to retrieve user calendar config for ${userId}: ${err.message}`);
    }
    return null;
  }

  getOAuthAuthorizeUrl(params: {
    userId: string;
    communityId: string;
    role?: string;
    redirectUri?: string;
  }): { url: string; state: string; isConfigured: boolean } {
    if (!calendarAvailable()) return { url: '', state: '', isConfigured: false };
    if (calendarIsReal()) {
      const signed = signState({ userId: params.userId, communityId: params.communityId, role: params.role || 'INTERVIEWER' });
      return { url: buildAuthorizeUrl(signed), state: signed, isConfigured: true };
    }
    const { userId, communityId, role = 'INTERVIEWER' } = params;
    const canonicalOrigin = 'https://community-manager-bot-720940628402.asia-southeast1.run.app';
    const redirectUri = params.redirectUri || `${canonicalOrigin}/api/v1/calendar/oauth/callback`;

    const statePayload = {
      userId,
      communityId,
      role,
      timestamp: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined;
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ];

    if (clientId) {
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
        scopes.join(' ')
      )}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
      return { url, state, isConfigured: true };
    }

    if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' || config.DEV_SIMULATION_ENABLED) {
      const authUrl = `/api/v1/calendar/oauth/callback?code=mock_oauth_code_${Date.now()}&state=${encodeURIComponent(
        state
      )}`;
      return { url: authUrl, state, isConfigured: true };
    }

    return {
      url: '',
      state,
      isConfigured: false,
    };
  }

  async getUserCalendarStatus(userId: string, communityId: string, role: string) {
    if (!calendarAvailable()) {
      return {
        eligible: false,
        shouldShowFirstLoginPrompt: false,
        preference: 'NEVER_CONFIGURED' as const,
        status: 'NEVER_CONFIGURED' as const,
        available: false,
        message: CALENDAR_NOT_CONFIGURED_MESSAGE,
      };
    }
    const eligible = this.isEligibleRole(role);
    if (!eligible) {
      return {
        eligible: false,
        shouldShowFirstLoginPrompt: false,
        preference: 'NEVER_CONFIGURED' as const,
        status: 'NEVER_CONFIGURED' as const,
      };
    }

    const userConfig = await this.getUserCalendarConfig(userId);

    if (!userConfig) {
      // Check legacy community-wide configuration migration default
      const communityConfig = await this.getCalendarConfig(communityId);
      if (communityConfig && communityConfig.enabled && communityConfig.status === 'CONNECTED') {
        return {
          eligible: true,
          shouldShowFirstLoginPrompt: false,
          preference: 'CONNECTED' as const,
          status: 'CONNECTED' as const,
          googleAccountId: 'community_calendar@google.com',
          calendarId: communityConfig.calendarId || 'primary',
          timezone: communityConfig.timezone || 'UTC',
        };
      }

      return {
        eligible: true,
        shouldShowFirstLoginPrompt: true,
        preference: 'NEVER_CONFIGURED' as const,
        status: 'NEVER_CONFIGURED' as const,
      };
    }

    // Decision Tree Implementation
    const preference = userConfig.preference || 'NEVER_CONFIGURED';
    const status = userConfig.status || 'NEVER_CONFIGURED';

    let shouldShowFirstLoginPrompt = false;

    if (preference === 'NEVER_CONFIGURED' && status === 'NEVER_CONFIGURED') {
      shouldShowFirstLoginPrompt = true;
    } else {
      // CONNECTED, SKIPPED, DISCONNECTED, or ERROR all result in false for first login prompt
      shouldShowFirstLoginPrompt = false;
    }

    return {
      eligible: true,
      shouldShowFirstLoginPrompt,
      preference,
      status,
      googleAccountId: userConfig.googleAccountId,
      calendarId: userConfig.calendarId || 'primary',
      timezone: userConfig.timezone || 'UTC',
      connectedAt: userConfig.connectedAt,
      lastSyncAt: userConfig.lastSyncAt,
      lastError: userConfig.lastError,
    };
  }

  async recordPromptShown(userId: string, communityId: string, role: string) {
    const now = new Date().toISOString();
    try {
      await auditLogsRepository.create({
        communityId,
        actorUserId: userId,
        actorRole: (role as any) || 'INTERVIEWER',
        action: 'CALENDAR_SETUP_PROMPT_SHOWN',
        targetType: 'userCalendarPreference',
        targetId: userId,
        metadata: { role, timestamp: now },
        timestamp: now,
      });
    } catch (auditErr: any) {
      logger.warn(`[GoogleCalendarService] Failed to record prompt shown audit log: ${auditErr.message}`);
    }
  }

  async skipUserCalendarSetup(userId: string, communityId: string, role: string): Promise<UserCalendarConfigDocument> {
    const now = new Date().toISOString();
    const existing = await this.getUserCalendarConfig(userId);

    const docId = existing?.id || `cal_usr_${userId}`;
    const targetCommunity = communityId || existing?.communityId || 'comm_default';
    const targetRole = role || existing?.role || 'INTERVIEWER';
    const nextVersion = (existing?.preferenceVersion || 0) + 1;

    const payload: UserCalendarConfigDocument = {
      id: docId,
      userId,
      communityId: targetCommunity,
      calendarId: existing?.calendarId || 'primary',
      preference: 'SKIPPED',
      status: existing?.status === 'CONNECTED' ? 'CONNECTED' : 'SKIPPED',
      preferenceVersion: nextVersion,
      role: targetRole,
      googleAccountId: existing?.googleAccountId,
      timezone: existing?.timezone || 'UTC',
      connectedAt: existing?.connectedAt,
      lastSyncAt: existing?.lastSyncAt,
      lastError: existing?.lastError,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const sanitizedPayload: any = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        sanitizedPayload[key] = value;
      }
    }

    let doc: UserCalendarConfigDocument;
    try {
      doc = await userCalendarConfigsRepository.upsert(sanitizedPayload);
    } catch (persistErr: any) {
      logger.error(`[GoogleCalendarService] Failed to persist skip preference in repository: ${persistErr.message}`);
      throw persistErr;
    }

    try {
      await auditLogsRepository.create({
        communityId: targetCommunity || 'system',
        actorUserId: userId,
        actorRole: (targetRole as any) || 'INTERVIEWER',
        action: 'CALENDAR_SETUP_SKIPPED',
        targetType: 'userCalendarPreference',
        targetId: userId,
        metadata: { role: targetRole, preferenceVersion: doc.preferenceVersion, timestamp: now },
        timestamp: now,
      });
    } catch (auditErr: any) {
      logger.warn(`[GoogleCalendarService] Failed to record skip audit log: ${auditErr.message}`);
    }

    return doc;
  }

  async connectUserCalendar(
    userId: string,
    communityId: string,
    role: string,
    googleAccountId?: string,
    calendarId = 'primary',
    timezone = 'UTC',
    tokens?: GoogleTokens
  ): Promise<UserCalendarConfigDocument> {
    if (!calendarAvailable()) throw new Error(`GOOGLE_CALENDAR_NOT_AVAILABLE: ${CALENDAR_NOT_CONFIGURED_MESSAGE}`);
    const now = new Date().toISOString();
    const existing = await this.getUserCalendarConfig(userId);
    if (calendarIsReal() && !tokens) throw new Error('GOOGLE_SIGN_IN_REQUIRED: Connect your calendar with the Google sign-in button.');
    const safeAccount = tokens?.email || googleAccountId || (userId.includes('@') ? userId : `${userId}@google.account`);
    const tokenFields: any = tokens
      ? {
          accessToken: tokens.accessToken,
          accessTokenExpiresAt: tokens.expiresAt,
          ...(tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {}),
          lastError: null,
        }
      : {};

    const isReconnect = existing && (existing.status === 'DISCONNECTED' || existing.preference === 'SKIPPED');
    const auditAction = isReconnect ? 'CALENDAR_RECONNECTED' : 'CALENDAR_CONNECTED';

    let doc: UserCalendarConfigDocument;
    if (existing) {
      doc = await userCalendarConfigsRepository.update(existing.id, {
        preference: 'CONNECTED',
        status: 'CONNECTED',
        googleAccountId: safeAccount,
        calendarId,
        timezone,
        connectedAt: existing.connectedAt || now,
        lastSyncAt: now,
        role: role || existing.role || 'INTERVIEWER',
        updatedAt: now,
        ...tokenFields,
      });
    } else {
      doc = await userCalendarConfigsRepository.create({
        id: `cal_usr_${userId}`,
        userId,
        communityId,
        googleAccountId: safeAccount,
        calendarId,
        timezone,
        preference: 'CONNECTED',
        status: 'CONNECTED',
        connectedAt: now,
        lastSyncAt: now,
        preferenceVersion: 1,
        role: role || 'INTERVIEWER',
        createdAt: now,
        updatedAt: now,
        ...tokenFields,
      } as any);
    }

    try {
      await auditLogsRepository.create({
        communityId,
        actorUserId: userId,
        actorRole: (role as any) || 'INTERVIEWER',
        action: auditAction as any,
        targetType: 'userCalendarConfiguration',
        targetId: userId,
        metadata: { googleAccountId: safeAccount, calendarId, timezone, timestamp: now },
        timestamp: now,
      });
    } catch (auditErr: any) {
      logger.warn(`[GoogleCalendarService] Failed to record connect audit log: ${auditErr.message}`);
    }

    return doc;
  }

  async disconnectUserCalendar(userId: string, communityId: string, role: string): Promise<UserCalendarConfigDocument> {
    const now = new Date().toISOString();
    const existing = await this.getUserCalendarConfig(userId);

    let doc: UserCalendarConfigDocument;
    if (existing) {
      doc = await userCalendarConfigsRepository.update(existing.id, {
        status: 'DISCONNECTED',
        accessToken: null,
        accessTokenExpiresAt: null,
        refreshTokenEnc: null,
        updatedAt: now,
      } as any);
    } else {
      doc = await userCalendarConfigsRepository.create({
        id: `cal_usr_${userId}`,
        userId,
        communityId,
        calendarId: 'primary',
        preference: 'SKIPPED', // Durable skip preference so first-login prompt does not re-appear
        status: 'DISCONNECTED',
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await auditLogsRepository.create({
        communityId,
        actorUserId: userId,
        actorRole: (role as any) || 'INTERVIEWER',
        action: 'CALENDAR_DISCONNECTED',
        targetType: 'userCalendarConfiguration',
        targetId: userId,
        metadata: { timestamp: now },
        timestamp: now,
      });
    } catch (auditErr: any) {
      logger.warn(`[GoogleCalendarService] Failed to record disconnect audit log: ${auditErr.message}`);
    }

    return doc;
  }

  async triggerReauthRequired(
    userId: string,
    communityId: string,
    role: string,
    reason = 'Google Calendar authorization expired or revoked'
  ): Promise<UserCalendarConfigDocument> {
    const now = new Date().toISOString();
    const existing = await this.getUserCalendarConfig(userId);

    let doc: UserCalendarConfigDocument;
    if (existing) {
      doc = await userCalendarConfigsRepository.update(existing.id, {
        status: 'REAUTH_REQUIRED',
        lastError: reason,
        updatedAt: now,
      });
    } else {
      doc = await userCalendarConfigsRepository.create({
        id: userId,
        userId,
        communityId,
        calendarId: 'primary',
        preference: 'CONNECTED',
        status: 'REAUTH_REQUIRED',
        lastError: reason,
        createdAt: now,
        updatedAt: now,
      });
    }

    await auditLogsRepository.create({
      communityId,
      actorUserId: userId,
      actorRole: (role as any) || 'INTERVIEWER',
      action: 'CALENDAR_REAUTH_REQUIRED',
      targetType: 'userCalendarConfiguration',
      targetId: userId,
      metadata: { reason, timestamp: now },
      timestamp: now,
    });

    return doc;
  }

  /** Returns a valid Google access token for a connected user, refreshing it when needed. */
  async getAccessToken(cfg: UserCalendarConfigDocument): Promise<string | null> {
    const c: any = cfg;
    if (!c || c.status !== 'CONNECTED') return null;
    if (c.accessToken && c.accessTokenExpiresAt && c.accessTokenExpiresAt > Date.now() + 60000) return c.accessToken;
    if (!c.refreshTokenEnc) return null;
    try {
      const t = await refreshAccessToken(decrypt(c.refreshTokenEnc));
      await userCalendarConfigsRepository.update(cfg.id, { accessToken: t.accessToken, accessTokenExpiresAt: t.expiresAt, lastSyncAt: new Date().toISOString() } as any);
      return t.accessToken;
    } catch (err: any) {
      logGoogleError('token refresh', err);
      if (err?.googleError === 'invalid_grant') {
        await userCalendarConfigsRepository.update(cfg.id, { status: 'REAUTH_REQUIRED', lastError: 'Google access was revoked. Reconnect your calendar.', updatedAt: new Date().toISOString() } as any);
      }
      return null;
    }
  }

  /** Real calendar event for a user (no-op when they have not connected Google). */
  private async createUserEvent(userId: string, input: { summary: string; description?: string; start: Date; end: Date; reminderMinutes?: number[]; sourceUrl?: string }) {
    const cfg = await this.getUserCalendarConfig(userId);
    if (!cfg) return null;
    const token = await this.getAccessToken(cfg);
    if (!token) return null;
    const ev = await calendarApi.insertEvent(token, cfg.calendarId || 'primary', { ...input, timeZone: cfg.timezone || 'UTC' });
    return { ...ev, calendarId: cfg.calendarId || 'primary', ownerUserId: userId };
  }

  /**
   * New application: put a "review this application" event (with reminders) on the calendar of every
   * reviewer in the community who connected Google Calendar.
   */
  async notifyNewApplication(params: { communityId: string; applicationId: string; applicantName: string; dashboardUrl?: string }) {
    if (!calendarIsReal()) return { created: 0 };
    const reviewers = (await userCalendarConfigsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: params.communityId },
        { field: 'status', operator: '==', value: 'CONNECTED' },
      ],
    })).filter((c: any) => ['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER', 'PLATFORM_OWNER'].includes(String(c.role || 'OWNER')));
    const start = new Date(Date.now() + 15 * 60000);
    const end = new Date(start.getTime() + 30 * 60000);
    let created = 0;
    for (const r of reviewers) {
      try {
        const ev = await this.createUserEvent(r.userId, {
          summary: `Review application: ${params.applicantName}`,
          description: `A new application is waiting for review in Community Manager.\n\nOpen it: ${params.dashboardUrl || ''}`,
          start,
          end,
          reminderMinutes: [0, 60],
          sourceUrl: params.dashboardUrl,
        });
        if (ev) created++;
      } catch (err) {
        logGoogleError(`new-application event for ${r.userId}`, err);
      }
    }
    if (created) logger.info(`[GoogleCalendar] Added review event for application ${params.applicationId} to ${created} calendar(s).`);
    return { created };
  }

  async listUserCalendars(userId: string, communityId: string) {
    const config = await this.getUserCalendarConfig(userId);

    if (!config || config.status !== 'CONNECTED') {
      return {
        googleAccountId: config?.googleAccountId || '',
        selectedCalendarId: config?.calendarId || '',
        calendars: [],
      };
    }

    if (calendarIsReal()) {
      const token = await this.getAccessToken(config);
      const calendars = token ? await calendarApi.listCalendars(token).catch((err: any) => { logGoogleError('list calendars', err); return []; }) : [];
      return { googleAccountId: config.googleAccountId || '', selectedCalendarId: config.calendarId || 'primary', calendars };
    }
    return {
      googleAccountId: config.googleAccountId || '',
      selectedCalendarId: config.calendarId || 'primary',
      calendars: [
        {
          id: config.calendarId || 'primary',
          summary: config.calendarId === 'primary' ? 'Primary Google Calendar' : (config.calendarId || 'Connected Calendar'),
          isPrimary: config.calendarId === 'primary',
          timeZone: config.timezone || 'UTC',
          accessRole: 'owner',
        },
      ],
    };
  }

  async selectUserCalendar(
    userId: string,
    communityId: string,
    role: string,
    calendarId: string
  ): Promise<UserCalendarConfigDocument> {
    const now = new Date().toISOString();
    const existing = await this.getUserCalendarConfig(userId);

    if (!existing) {
      throw new Error(`Calendar configuration not found for user ${userId}. Connect calendar first.`);
    }

    const doc = await userCalendarConfigsRepository.update(existing.id, {
      calendarId,
      updatedAt: now,
    });

    await auditLogsRepository.create({
      communityId,
      actorUserId: userId,
      actorRole: (role as any) || 'INTERVIEWER',
      action: 'CALENDAR_CHANGED',
      targetType: 'userCalendarConfiguration',
      targetId: userId,
      metadata: { previousCalendarId: existing.calendarId, newCalendarId: calendarId, timestamp: now },
      timestamp: now,
    });

    return doc;
  }

  async configureCalendar(
    communityId: string,
    calendarId: string,
    timezone = 'UTC',
    enabled = true
  ): Promise<GoogleCalendarConfig> {
    const existing = await googleCalendarConfigsRepository.listForTenant(communityId);
    const now = new Date().toISOString();

    let configDoc: GoogleCalendarConfig;
    if (existing.length > 0) {
      configDoc = await googleCalendarConfigsRepository.update(existing[0].id, {
        calendarId,
        timezone,
        enabled,
        status: enabled ? 'CONNECTED' : 'DISCONNECTED',
        updatedAt: now,
      });
    } else {
      configDoc = await googleCalendarConfigsRepository.create({
        communityId,
        calendarId,
        timezone,
        enabled,
        status: enabled ? 'CONNECTED' : 'DISCONNECTED',
        createdAt: now,
        updatedAt: now,
      });
    }

    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: enabled ? 'GOOGLE_CALENDAR_CONNECTED' : 'GOOGLE_CALENDAR_DISCONNECTED',
      targetType: 'calendarConfiguration',
      targetId: configDoc.id,
      metadata: { calendarId, timezone, enabled },
      timestamp: now,
    });

    return configDoc;
  }

  async getCalendarConfig(communityId: string): Promise<GoogleCalendarConfig | null> {
    const configs = await googleCalendarConfigsRepository.listForTenant(communityId);
    return configs[0] || null;
  }

  getDiagnostics(): { state: 'READY' | 'CONFIGURED' | 'NOT_CONFIGURED' | 'AUTHENTICATING'; enabled: boolean } {
    return {
      state: 'NOT_CONFIGURED',
      enabled: false,
    };
  }

  async scheduleInterviewEvent(params: {
    communityId: string;
    interviewId: string;
    applicantUsername: string;
    interviewerUsername: string;
    interviewerUserId?: string;
    scheduledAt: string;
    timezone?: string;
    durationMinutes?: number;
    workflowRequiresCalendar?: boolean;
  }): Promise<CalendarEventResult> {
    const now = new Date().toISOString();
    if (!calendarAvailable()) {
      return { status: 'CALENDAR_NOT_CONNECTED', message: 'Interview scheduled. Google Calendar events are not available yet.' };
    }

    // Check interviewer user calendar status if interviewerUserId provided
    let userCalConnected = false;
    let interviewerCalConfig: UserCalendarConfigDocument | null = null;

    if (params.interviewerUserId) {
      interviewerCalConfig = await this.getUserCalendarConfig(params.interviewerUserId);
      if (interviewerCalConfig && interviewerCalConfig.status === 'CONNECTED') {
        userCalConnected = true;
      }
    }

    // Check legacy community calendar config as fallback
    const calConfig = await this.getCalendarConfig(params.communityId);
    const isConnected = userCalConnected || (calConfig && calConfig.enabled && calConfig.status === 'CONNECTED');

    if (!isConnected) {
      if (params.workflowRequiresCalendar) {
        return {
          status: 'CALENDAR_REQUIRED',
          message: 'Connect Google Calendar to schedule this interview',
        };
      }
      return {
        status: 'CALENDAR_NOT_CONNECTED',
        message: 'Google Calendar not connected for interviewer. Interview scheduled without Calendar event.',
      };
    }

    const timezone = params.timezone || interviewerCalConfig?.timezone || calConfig?.timezone || 'UTC';

    // 1. Idempotency Check
    const existingEvents = await integrationEventsRepository.listForTenant(params.communityId, {
      where: [
        { field: 'provider', operator: '==', value: 'GOOGLE_CALENDAR' },
        { field: 'externalEventId', operator: '==', value: params.interviewId },
      ],
    });

    if (existingEvents.length > 0 && existingEvents[0].status === 'PROCESSED') {
      const interview = await interviewsRepository.getById(params.interviewId);
      if (interview && interview.googleCalendarEventId) {
        logger.info(`[GoogleCalendar] Event already exists for interview ${params.interviewId}. Idempotent return.`);
        return {
          eventId: interview.googleCalendarEventId,
          htmlLink: interview.googleCalendarEventLink || `https://calendar.google.com/calendar/event?eid=${interview.googleCalendarEventId}`,
          status: 'CONFIRMED',
          summary: `Recruitment Interview: ${params.applicantUsername} x ${params.interviewerUsername}`,
          start: params.scheduledAt,
          end: new Date(new Date(params.scheduledAt).getTime() + 30 * 60000).toISOString(),
          timezone,
          isDuplicate: true,
        };
      }
    }

    const duration = params.durationMinutes || 30;
    const startDate = new Date(params.scheduledAt);
    const endDate = new Date(startDate.getTime() + duration * 60000);

    const summary = `Recruitment Interview: ${params.applicantUsername} x ${params.interviewerUsername}`;
    let eventId = `cal_evt_${params.interviewId}`;
    let htmlLink = `https://calendar.google.com/calendar/event?eid=${eventId}`;
    if (calendarIsReal()) {
      let real: any = null;
      try {
        real = params.interviewerUserId
          ? await this.createUserEvent(params.interviewerUserId, {
              summary,
              description: `Interview with ${params.applicantUsername}. Scheduled from Community Manager.`,
              start: startDate,
              end: endDate,
              reminderMinutes: [60, 10],
            })
          : null;
      } catch (err) {
        logGoogleError('interview event', err);
      }
      if (!real) {
        return { status: 'CALENDAR_NOT_CONNECTED', message: 'Interview scheduled. The interviewer has not connected Google Calendar, so no calendar event was added.' };
      }
      eventId = real.id;
      htmlLink = real.htmlLink;
    }

    logger.info(`[GoogleCalendar] Scheduled interview event ${eventId} for community ${params.communityId}`);

    // Update interview record if it exists
    const existingInterview = await interviewsRepository.getById(params.interviewId);
    if (existingInterview) {
      await interviewsRepository.update(params.interviewId, {
        googleCalendarEventId: eventId,
        googleCalendarEventLink: htmlLink,
        googleCalendarOwnerUserId: params.interviewerUserId,
        updatedAt: now,
      } as any);
    }

    // Record Integration Event Ledger
    await integrationEventsRepository.create({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'GOOGLE_CALENDAR',
      eventType: 'CALENDAR_EVENT_CREATED',
      communityId: params.communityId,
      externalResourceId: interviewerCalConfig?.calendarId || calConfig?.calendarId || 'primary',
      externalEventId: params.interviewId,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      retryCount: 0,
    });

    // Audit Log
    await auditLogsRepository.create({
      communityId: params.communityId,
      actorUserId: params.interviewerUserId || 'SYSTEM',
      actorRole: 'OWNER',
      action: 'CALENDAR_EVENT_CREATED',
      targetType: 'interview',
      targetId: params.interviewId,
      metadata: { eventId, scheduledAt: params.scheduledAt, timezone, interviewerUserId: params.interviewerUserId },
      timestamp: now,
    });

    return {
      eventId,
      htmlLink,
      status: 'CONFIRMED',
      summary,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      timezone,
      isDuplicate: false,
    };
  }

  async updateInterviewEvent(params: {
    communityId: string;
    interviewId: string;
    eventId: string;
    applicantUsername: string;
    interviewerUsername: string;
    interviewerUserId?: string;
    scheduledAt: string;
    timezone?: string;
    durationMinutes?: number;
  }): Promise<CalendarEventResult> {
    const now = new Date().toISOString();
    const duration = params.durationMinutes || 30;
    const startDate = new Date(params.scheduledAt);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const timezone = params.timezone || 'UTC';

    const summary = `Recruitment Interview (Rescheduled): ${params.applicantUsername} x ${params.interviewerUsername}`;
    let htmlLink = `https://calendar.google.com/calendar/event?eid=${params.eventId}`;
    if (calendarIsReal()) {
      const interview: any = await interviewsRepository.getById(params.interviewId);
      const ownerId = interview?.googleCalendarOwnerUserId || params.interviewerUserId;
      const cfg = ownerId ? await this.getUserCalendarConfig(ownerId) : null;
      const token = cfg ? await this.getAccessToken(cfg) : null;
      if (!token || !cfg) {
        return { status: 'CALENDAR_NOT_CONNECTED', message: 'Interview rescheduled. The calendar owner is not connected, so the calendar event was not changed.' };
      }
      const ev = await calendarApi.patchEvent(token, cfg.calendarId || 'primary', params.eventId, { summary, start: startDate, end: endDate, timeZone: timezone, reminderMinutes: [60, 10] });
      htmlLink = ev.htmlLink;
    }

    logger.info(`[GoogleCalendar] Rescheduled interview event ${params.eventId} for interview ${params.interviewId}`);

    // Update interview record in repository
    const existingInterview = await interviewsRepository.getById(params.interviewId);
    if (existingInterview) {
      await interviewsRepository.update(params.interviewId, {
        googleCalendarEventId: params.eventId,
        googleCalendarEventLink: htmlLink,
        scheduledAt: params.scheduledAt,
        updatedAt: now,
      });
    }

    // Ledger entry for event update
    await integrationEventsRepository.create({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'GOOGLE_CALENDAR',
      eventType: 'CALENDAR_EVENT_UPDATED',
      communityId: params.communityId,
      externalResourceId: params.eventId,
      externalEventId: params.interviewId,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      retryCount: 0,
    });

    // Audit log
    await auditLogsRepository.create({
      communityId: params.communityId,
      actorUserId: params.interviewerUserId || 'SYSTEM',
      actorRole: 'OWNER',
      action: 'CALENDAR_EVENT_UPDATED',
      targetType: 'interview',
      targetId: params.interviewId,
      metadata: { eventId: params.eventId, newScheduledAt: params.scheduledAt, timezone },
      timestamp: now,
    });

    return {
      eventId: params.eventId,
      htmlLink,
      status: 'CONFIRMED',
      summary,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      timezone,
      isDuplicate: false,
    };
  }

  async cancelInterviewEvent(communityId: string, interviewId: string, eventId: string): Promise<boolean> {
    const now = new Date().toISOString();
    if (calendarIsReal()) {
      const interview: any = await interviewsRepository.getById(interviewId);
      const cfg = interview?.googleCalendarOwnerUserId ? await this.getUserCalendarConfig(interview.googleCalendarOwnerUserId) : null;
      const token = cfg ? await this.getAccessToken(cfg) : null;
      if (token && cfg) {
        try { await calendarApi.deleteEvent(token, cfg.calendarId || 'primary', eventId); } catch (err) { logGoogleError('cancel event', err); return false; }
      }
    }
    logger.info(`[GoogleCalendar] Cancelled calendar event ${eventId} for interview ${interviewId}`);

    await integrationEventsRepository.create({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'GOOGLE_CALENDAR',
      eventType: 'CALENDAR_EVENT_CANCELLED',
      communityId,
      externalResourceId: eventId,
      externalEventId: interviewId,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      retryCount: 0,
    });

    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: 'CALENDAR_EVENT_CANCELLED',
      targetType: 'interview',
      targetId: interviewId,
      metadata: { eventId },
      timestamp: now,
    });

    return true;
  }
}

export const googleCalendarService = new GoogleCalendarService();
