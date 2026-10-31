import { observabilityService } from './observability.service.js';
import { logger } from '../../logging/logger.js';

export interface DiscordDiagnostic {
  connected: boolean;
  botConfigured: boolean;
  gatewayStatus: 'HEALTHY' | 'DEGRADED' | 'DISCONNECTED';
  guildId?: string;
  botPermissionsValid?: boolean;
  issues: string[];
  recoveryInstructions: string[];
}

export class DiscordRecoveryHelper {
  static diagnose(botTokenPresent: boolean, guildConnected: boolean, botPermissions?: string[]): DiscordDiagnostic {
    const issues: string[] = [];
    const instructions: string[] = [];

    if (!botTokenPresent) {
      issues.push('DISCORD_BOT_TOKEN environment variable is missing.');
      instructions.push('Configure DISCORD_BOT_TOKEN in platform settings or environment config.');
      observabilityService.updateDependencyStatus(
        'discord_gateway',
        'NOT_CONFIGURED',
        'DISCORD_BOT_TOKEN is missing',
        'Provide DISCORD_BOT_TOKEN in environment'
      );
      return {
        connected: false,
        botConfigured: false,
        gatewayStatus: 'DISCONNECTED',
        issues,
        recoveryInstructions: instructions,
      };
    }

    if (!guildConnected) {
      issues.push('Bot is not connected or removed from the authorized Discord guild.');
      instructions.push('Use Connection Center to generate a fresh Bot Invite Link with requested scopes and install the bot.');
      observabilityService.updateDependencyStatus(
        'discord_gateway',
        'DEGRADED',
        'Bot disconnected from target guild',
        'Re-authorize bot installation via Connection Center'
      );
      return {
        connected: false,
        botConfigured: true,
        gatewayStatus: 'DISCONNECTED',
        issues,
        recoveryInstructions: instructions,
      };
    }

    // Permission checks
    if (botPermissions && !botPermissions.includes('MANAGE_ROLES')) {
      issues.push('Bot lacks MANAGE_ROLES permission in target Discord server.');
      instructions.push('Grant MANAGE_ROLES permission to Community Manager bot role in Discord Server Settings -> Roles.');
    }

    const gatewayStatus = issues.length > 0 ? 'DEGRADED' : 'HEALTHY';
    observabilityService.updateDependencyStatus(
      'discord_gateway',
      gatewayStatus === 'HEALTHY' ? 'HEALTHY' : 'DEGRADED',
      issues.join('; ') || 'Discord bot active and connected',
      instructions.join('; ')
    );

    return {
      connected: true,
      botConfigured: true,
      gatewayStatus,
      botPermissionsValid: issues.length === 0,
      issues,
      recoveryInstructions: instructions,
    };
  }

  static async handleGatewayDisconnect(correlationId: string, errorDetail: string) {
    logger.logOperational({
      correlationId,
      operation: 'DISCORD_GATEWAY_RECONNECT',
      status: 'RETRYING',
      errorCategory: 'DISCORD_UNAVAILABLE',
      errorMessage: `Gateway disconnected: ${errorDetail}`,
    });

    await observabilityService.recordIncident({
      category: 'DISCORD_UNAVAILABLE',
      dependency: 'Discord Gateway',
      summary: `Discord Gateway disconnected: ${errorDetail}`,
      severity: 'HIGH',
      correlationId,
      recoveryInstructions: 'Check Discord API status page or verify network connectivity.',
    });
  }
}
