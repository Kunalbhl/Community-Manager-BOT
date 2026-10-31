import { MetricTrend, MemberGrowthPoint } from '../../../shared/types/insights.js';

export class InsightsTrendService {
  /**
   * Evaluates overall trend from historical data series or comparison values
   */
  static evaluateTrend(current: number | null, previous: number | null): MetricTrend {
    if (current === null || previous === null) {
      return 'INSUFFICIENT_DATA';
    }
    if (current > previous) {
      return 'INCREASE';
    }
    if (current < previous) {
      return 'DECREASE';
    }
    return 'STABLE';
  }

  /**
   * Calculate time-series points for member growth
   */
  static buildGrowthTimeSeries(
    dailyBuckets: string[],
    membersJoinedByDate: Record<string, number>,
    membersLeftByDate: Record<string, number>,
    startingTotal: number
  ): MemberGrowthPoint[] {
    let runningTotal = startingTotal;

    return dailyBuckets.map((date) => {
      const newMembers = membersJoinedByDate[date] || 0;
      const departures = membersLeftByDate[date] || 0;
      const netChange = newMembers - departures;
      runningTotal += netChange;

      return {
        date,
        newMembers,
        departures,
        netChange,
        totalMembers: Math.max(0, runningTotal),
      };
    });
  }
}
