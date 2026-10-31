import { db } from '../config/firestore.js';
import { logger } from '../logging/logger.js';
import { EngagementSchedulerService } from '../services/engagement.service.js';
import { observabilityService } from '../services/observability/observability.service.js';

export class SchedulerWorker {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;
    observabilityService.setSchedulerRunning(true);
    observabilityService.recordSchedulerHeartbeat();
    logger.info('[SchedulerWorker] Started execution lock polling.');

    this.intervalTimer = setInterval(async () => {
      try {
        observabilityService.recordSchedulerHeartbeat();
        await this.processScheduledEngagements();
      } catch (err: any) {
        observabilityService.recordWorkerFailure('SchedulerWorker', err?.message || 'Execution error');
        logger.error('[SchedulerWorker] Execution error:', undefined, { error: err?.message });
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    observabilityService.setSchedulerRunning(false);
    logger.info('[SchedulerWorker] Stopped.');
  }

  async processScheduledEngagements() {
    observabilityService.recordSchedulerHeartbeat();
    await EngagementSchedulerService.processScheduledJobs();
  }
}

export const schedulerWorker = new SchedulerWorker();
