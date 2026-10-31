import {
  NotificationDeliveryChannel,
  NotificationDeliveryState,
} from '../../shared/types/notifications.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { recruiterNotificationHistoryRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';

export interface DispatchDeliveryParams {
  notificationId: string;
  communityId?: string;
  recipientUserId: string;
  recipientDiscordId?: string;
  channel: NotificationDeliveryChannel;
  title: string;
  body: string;
  targetChannelId?: string;
}

export interface DeliveryResult {
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryState;
  deliveryStatus: NotificationDeliveryState;
  deliveredAt?: string;
  error?: string;
}

export class NotificationDeliveryService {
  /**
   * Dispatches the notification payload through the requested channel.
   * Reports truthful delivery state without fabricating false success.
   */
  static async dispatch(params: DispatchDeliveryParams): Promise<DeliveryResult> {
    const { notificationId, communityId, recipientUserId, recipientDiscordId, channel, title, body, targetChannelId } = params;

    // 1. IN_APP Channel (Always delivers synchronously)
    if (channel === 'IN_APP') {
      return {
        channel: 'IN_APP',
        status: 'DELIVERED',
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date().toISOString(),
      };
    }

    // 2. DISCORD Channel
    if (channel === 'DISCORD') {
      if (!discordService.isConfigured()) {
        return {
          channel: 'DISCORD',
          status: 'NOT_CONFIGURED',
          deliveryStatus: 'NOT_CONFIGURED',
          error: 'Discord bot token is not configured on the platform',
        };
      }

      // If sending to a specific Discord channel
      if (targetChannelId) {
        try {
          const result = await discordService.sendChannelMessage(targetChannelId, `**${title}**\n\n${body}`);
          if (result.success) {
            return {
              channel: 'DISCORD',
              status: 'DELIVERED',
              deliveryStatus: 'DELIVERED',
              deliveredAt: result.sentAt,
            };
          } else {
            const status: NotificationDeliveryState =
              result.failureReason === 'BOT_NOT_CONNECTED' ? 'FAILED' : 'FAILED';
            return {
              channel: 'DISCORD',
              status,
              deliveryStatus: status,
              error: result.failureReason || 'Failed to send Discord channel message',
            };
          }
        } catch (err: any) {
          return {
            channel: 'DISCORD',
            status: 'FAILED',
            deliveryStatus: 'FAILED',
            error: err.message,
          };
        }
      }

      // If sending Direct Message to user
      if (recipientDiscordId) {
        try {
          const formatted = `**${title}**\n\n${body}`;
          const result = await discordService.sendDM(recipientDiscordId, formatted);

          const now = new Date().toISOString();
          const deliveryStatus = result.success ? 'DELIVERED' : 'FAILED';

          if (communityId) {
            await recruiterNotificationHistoryRepository.create({
              communityId,
              recipientUserId,
              recipientDiscordId,
              type: 'SYSTEM_NOTIFICATION',
              channel: 'DISCORD_DM',
              title,
              body,
              status: deliveryStatus,
              deliveredAt: result.success ? result.sentAt : undefined,
              failureReason: result.success ? undefined : result.failureReason,
              createdAt: now,
            }).catch(() => {});
          }

          if (result.success) {
            return {
              channel: 'DISCORD',
              status: 'DELIVERED',
              deliveryStatus: 'DELIVERED',
              deliveredAt: result.sentAt,
            };
          } else {
            return {
              channel: 'DISCORD',
              status: 'FAILED',
              deliveryStatus: 'FAILED',
              error: result.failureReason || 'Failed to send Discord direct message',
            };
          }
        } catch (err: any) {
          return {
            channel: 'DISCORD',
            status: 'FAILED',
            deliveryStatus: 'FAILED',
            error: err.message,
          };
        }
      }

      return {
        channel: 'DISCORD',
        status: 'FAILED',
        deliveryStatus: 'FAILED',
        error: 'Recipient Discord ID or target channel ID is missing',
      };
    }

    // 3. EMAIL Channel (Truthful reporting - no active SMTP provider configured)
    if (channel === 'EMAIL') {
      return {
        channel: 'EMAIL',
        status: 'NOT_CONFIGURED',
        deliveryStatus: 'NOT_CONFIGURED',
        error: 'Email delivery provider (SMTP/SES) is not configured in this environment',
      };
    }

    return {
      channel,
      status: 'FAILED',
      deliveryStatus: 'FAILED',
      error: `Unsupported delivery channel: ${channel}`,
    };
  }
}
