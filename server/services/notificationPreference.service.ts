import {
  NotificationCategory,
  NotificationPolicy,
  NotificationPriority,
  UserNotificationPreference,
} from '../../shared/types/notifications.js';
import { UserRole } from '../../shared/types/rbac.js';
import { canViewVisibility } from '../security/rbac.js';
import { VisibilityLevel } from '../../shared/types/community.js';
import { SettingsService } from './settings.service.js';
import { userNotificationPreferencesRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { auditService } from './audit.service.js';

export interface CheckNotificationEligibilityParams {
  communityId?: string;
  recipientUserId: string;
  recipientRole?: UserRole;
  category: NotificationCategory;
  priority: NotificationPriority;
  policy: NotificationPolicy;
}

export class NotificationPreferenceService {
  /**
   * Checks whether a notification should be delivered to the recipient based on:
   * 1. Mandatory policy (REQUIRED alerts always pass)
   * 2. Community settings (category enabled, minimum role clearance)
   * 3. Recipient user preferences
   */
  static async isEligible(params: CheckNotificationEligibilityParams): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // 1. REQUIRED notifications cannot be suppressed or disabled
    if (params.policy === 'REQUIRED' || params.priority === 'CRITICAL' || params.category === 'SECURITY') {
      return { allowed: true };
    }

    // 2. Check community-level configuration if scoped to a community
    if (params.communityId) {
      try {
        const settings = await SettingsService.getConsolidatedSettings(params.communityId);
        const categoryKey = params.category.toLowerCase();
        const categoryConfig = settings.notifications?.categories?.[categoryKey];

        if (categoryConfig) {
          // Check if category is enabled in this community
          if (!categoryConfig.enabled) {
            return { allowed: false, reason: `Category ${params.category} disabled in community settings` };
          }

          // Check role clearance only when recipient is not explicitly targeted by userId
          if (!params.recipientUserId && params.recipientRole && categoryConfig.minimumRole) {
            const hasClearance = canViewVisibility(
              params.recipientRole,
              categoryConfig.minimumRole as VisibilityLevel
            );
            if (!hasClearance) {
              return {
                allowed: false,
                reason: `Recipient role ${params.recipientRole} does not meet minimum role ${categoryConfig.minimumRole}`,
              };
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[NotificationPreference] Failed to load settings for community ${params.communityId}: ${err.message}`);
      }
    }

    // 3. Check user-level preferences
    try {
      const userPrefId = `${params.recipientUserId}_${params.communityId || 'global'}`;
      const userPref = await userNotificationPreferencesRepository.getById(userPrefId);

      if (userPref && userPref.categories && userPref.categories[params.category]) {
        const userCat = userPref.categories[params.category];
        if (userCat.enabled === false) {
          return { allowed: false, reason: `Category ${params.category} disabled by user preference` };
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return { allowed: true };
  }

  /**
   * Retrieves effective notification preferences for a user in a given community or global context.
   */
  static async getUserPreferences(userId: string, communityId?: string): Promise<UserNotificationPreference> {
    const userPrefId = `${userId}_${communityId || 'global'}`;
    const existing = await userNotificationPreferencesRepository.getById(userPrefId);

    const defaultCategories: UserNotificationPreference['categories'] = {
      RECRUITMENT: { enabled: true, channels: ['IN_APP', 'DISCORD'] },
      ENGAGEMENT: { enabled: true, channels: ['IN_APP', 'DISCORD'] },
      MODERATION: { enabled: true, channels: ['IN_APP'] },
      EVENTS: { enabled: true, channels: ['IN_APP', 'DISCORD'] },
      AUTOMATION: { enabled: true, channels: ['IN_APP'] },
      INTEGRATIONS: { enabled: true, channels: ['IN_APP'] },
      SECURITY: { enabled: true, channels: ['IN_APP'] },
      SYSTEM: { enabled: true, channels: ['IN_APP'] },
      INSIGHTS: { enabled: true, channels: ['IN_APP'] },
      PLATFORM: { enabled: true, channels: ['IN_APP'] },
    };

    if (existing) {
      return {
        userId,
        communityId,
        categories: { ...defaultCategories, ...(existing.categories as any) },
        emailNotificationsEnabled: existing.emailNotificationsEnabled ?? false,
        discordDmEnabled: existing.discordDmEnabled ?? true,
        inAppEnabled: existing.inAppEnabled ?? true,
        updatedAt: existing.updatedAt || new Date().toISOString(),
      };
    }

    return {
      userId,
      communityId,
      categories: defaultCategories,
      emailNotificationsEnabled: false,
      discordDmEnabled: true,
      inAppEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates user notification preferences and records an audit log.
   */
  static async updateUserPreferences(
    userId: string,
    communityId: string | undefined,
    actorRole: UserRole,
    updates: Partial<UserNotificationPreference>
  ): Promise<UserNotificationPreference> {
    const userPrefId = `${userId}_${communityId || 'global'}`;
    const current = await this.getUserPreferences(userId, communityId);

    // Ensure SECURITY cannot be disabled (enforce required security policy)
    if (updates.categories && updates.categories.SECURITY) {
      updates.categories.SECURITY.enabled = true;
    }

    const merged: UserNotificationPreference = {
      ...current,
      ...updates,
      categories: {
        ...current.categories,
        ...(updates.categories || {}),
        SECURITY: { enabled: true, channels: ['IN_APP'] }, // Mandatory enforcement
      },
      updatedAt: new Date().toISOString(),
    };

    await userNotificationPreferencesRepository.upsert(userPrefId, {
      id: userPrefId,
      userId,
      communityId,
      categories: merged.categories as any,
      emailNotificationsEnabled: merged.emailNotificationsEnabled,
      discordDmEnabled: merged.discordDmEnabled,
      inAppEnabled: merged.inAppEnabled,
      updatedAt: merged.updatedAt,
    });

    if (communityId) {
      await auditService.record({
        communityId,
        actorUserId: userId,
        actorRole,
        action: 'NOTIFICATION_PREFERENCE_UPDATED',
        targetType: 'user_notification_preference',
        targetId: userPrefId,
        newState: merged,
      });
    }

    return merged;
  }
}
