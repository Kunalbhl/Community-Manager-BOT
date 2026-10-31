import { FunnelStageResult } from '../../../shared/types/insights.js';

export interface RawFunnelStageInput {
  stage: string;
  label: string;
  count: number;
}

export class InsightsFunnelService {
  /**
   * Calculates a step-by-step conversion funnel.
   * Input: ordered list of stages with authoritative counts.
   * Output: stage count, conversion from previous stage, overall conversion, drop-off.
   * Zero denominator is strictly handled: returns null instead of NaN.
   */
  static computeFunnel(stages: RawFunnelStageInput[]): FunnelStageResult[] {
    if (!stages || stages.length === 0) {
      return [];
    }

    const baselineCount = stages[0]?.count || 0;

    return stages.map((currentStage, index) => {
      const count = Math.max(0, currentStage.count);

      let conversionFromPrevious: number | null = null;
      let dropOff = 0;

      if (index === 0) {
        conversionFromPrevious = 100.0;
        dropOff = 0;
      } else {
        const prevCount = stages[index - 1].count;
        if (prevCount > 0) {
          conversionFromPrevious = Math.round((count / prevCount) * 1000) / 10;
          dropOff = Math.max(0, prevCount - count);
        } else {
          conversionFromPrevious = null;
          dropOff = 0;
        }
      }

      let overallConversion: number | null = null;
      if (baselineCount > 0) {
        overallConversion = Math.round((count / baselineCount) * 1000) / 10;
      } else {
        overallConversion = null;
      }

      return {
        stage: currentStage.stage,
        label: currentStage.label,
        count,
        conversionFromPrevious,
        overallConversion,
        dropOff,
      };
    });
  }
}
