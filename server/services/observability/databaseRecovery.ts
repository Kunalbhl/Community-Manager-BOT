import { observabilityService } from './observability.service.js';
import { StandardError } from '../../utils/standardError.js';
import { logger } from '../../logging/logger.js';

export class DatabaseRecoveryHelper {
  private static isSimulatedDown = false;

  static setSimulatedDown(down: boolean) {
    this.isSimulatedDown = down;
  }

  static async assertHealthy(operation: string, correlationId: string) {
    if (this.isSimulatedDown) {
      logger.logOperational({
        correlationId,
        operation: `DB_WRITE:${operation}`,
        status: 'FAILURE',
        errorCategory: 'DATABASE_UNAVAILABLE',
        errorMessage: 'Database persistence is unavailable. Truthful write refusal.',
      });

      await observabilityService.recordIncident({
        category: 'DATABASE_UNAVAILABLE',
        dependency: 'Database',
        summary: `Database persistence write failure during ${operation}`,
        severity: 'CRITICAL',
        correlationId,
        recoveryInstructions: 'Check database connectivity and cluster health.',
      });

      throw new StandardError({
        message: `Database persistence unavailable during ${operation}. Write aborted to prevent unpersisted state.`,
        code: 'DATABASE_UNAVAILABLE',
        statusCode: 503,
        retryable: true,
        correlationId,
      });
    }
  }
}
