import { MetricValue, MetricStatus, MetricTrend } from '../../../shared/types/insights.js';

export class InsightsMetricService {
  /**
   * Builds a strictly validated metric contract.
   * Handles edge cases (zero denominator, null comparison, negative trends, percentage bounds)
   * without ever returning NaN or misleading percentages.
   */
  static buildMetric<T = number>(
    currentValue: T | null,
    previousValue: T | null = null,
    overrideStatus?: MetricStatus,
    note?: string
  ): MetricValue<T> {
    if (overrideStatus && overrideStatus !== 'AVAILABLE') {
      return {
        value: currentValue,
        previousValue: null,
        delta: null,
        deltaPercent: null,
        trend: 'INSUFFICIENT_DATA',
        status: overrideStatus,
        note,
      };
    }

    if (currentValue === null || currentValue === undefined) {
      return {
        value: null,
        previousValue: null,
        delta: null,
        deltaPercent: null,
        trend: 'INSUFFICIENT_DATA',
        status: 'INSUFFICIENT_DATA',
        note: note || 'Metric data is currently unavailable.',
      };
    }

    // When value is numeric, evaluate delta and trend
    if (typeof currentValue === 'number') {
      if (previousValue === null || previousValue === undefined || typeof previousValue !== 'number') {
        return {
          value: currentValue,
          previousValue: null,
          delta: null,
          deltaPercent: null,
          trend: 'INSUFFICIENT_DATA',
          status: 'AVAILABLE',
          note: note || 'No prior comparison period data available.',
        };
      }

      const delta = Math.round((currentValue - previousValue) * 100) / 100;
      let deltaPercent: number | null = null;
      let trend: MetricTrend = 'STABLE';

      if (delta > 0) {
        trend = 'INCREASE';
      } else if (delta < 0) {
        trend = 'DECREASE';
      } else {
        trend = 'STABLE';
      }

      // Calculate percentage change only if previousValue is non-zero
      if (previousValue > 0) {
        deltaPercent = Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
      } else if (previousValue === 0) {
        // Mathematical edge case: zero denominator
        deltaPercent = null;
        if (currentValue > 0) {
          trend = 'INCREASE';
        }
      }

      return {
        value: currentValue,
        previousValue,
        delta,
        deltaPercent,
        trend,
        status: 'AVAILABLE',
        note,
      };
    }

    // Non-numeric value (e.g. status string)
    return {
      value: currentValue,
      previousValue,
      delta: null,
      deltaPercent: null,
      trend: 'STABLE',
      status: 'AVAILABLE',
      note,
    };
  }

  /**
   * Helper to format a percentage safely or return null / INSUFFICIENT_DATA
   */
  static calculateRate(numerator: number, denominator: number): number | null {
    if (!denominator || denominator <= 0) {
      return null;
    }
    const rate = (numerator / denominator) * 100;
    return Math.round(rate * 10) / 10;
  }
}
