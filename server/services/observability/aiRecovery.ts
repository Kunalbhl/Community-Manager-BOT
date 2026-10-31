import { observabilityService } from './observability.service.js';
import { StandardError } from '../../utils/standardError.js';
import { logger } from '../../logging/logger.js';
import { AiTelemetryService } from '../ai/aiTelemetry.service.js';

export class AiRecoveryHelper {
  static async executeAiPipeline<T>(
    communityId: string,
    operationName: string,
    correlationId: string,
    aiFn: () => Promise<T>
  ): Promise<T> {
    try {
      return await AiTelemetryService.withTimeout(
        AiTelemetryService.withRetry(async () => aiFn(), {
          maxRetries: 2,
          operationName,
          correlationId,
        }),
        15000,
        operationName,
        correlationId
      );
    } catch (err: any) {
      logger.logOperational({
        correlationId,
        communityId,
        operation: `AI_PIPELINE:${operationName}`,
        status: 'FAILURE',
        errorCategory: err.category || 'AI_PROCESSING_FAILED',
        errorMessage: err.message || 'AI pipeline failure',
      });

      await observabilityService.recordIncident({
        category: 'AI_PROCESSING_FAILED',
        dependency: 'Community Brain AI Engine',
        summary: `AI pipeline execution failed for ${operationName}: ${err.message}`,
        severity: 'MEDIUM',
        correlationId,
        communityId,
        recoveryInstructions: 'Check AI_API_KEY environment variable and API quota limits.',
      });

      throw new StandardError({
        message: `AI assistant service failed during ${operationName}: ${err.message}`,
        code: 'AI_PROCESSING_FAILED',
        statusCode: 502,
        retryable: true,
        correlationId,
      });
    }
  }
}
