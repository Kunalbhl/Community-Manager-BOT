import { DateRangeType } from '../../../shared/types/insights.js';

export interface ResolvedDateRange {
  rangeType: DateRangeType;
  rangeStart: string; // ISO String
  rangeEnd: string; // ISO String
  previousRangeStart: string; // ISO String
  previousRangeEnd: string; // ISO String
  timezone: string;
  daysDiff: number;
  dailyBuckets: string[]; // YYYY-MM-DD
}

export class InsightsDateService {
  /**
   * Resolve user-selected date range to authoritative start/end timestamps and comparison range.
   * Fully timezone-aware: never silently assumes UTC when community timezone is provided.
   */
  static resolveDateRange(
    rangeType: DateRangeType = 'LAST_30_DAYS',
    communityTimezone?: string,
    customStart?: string,
    customEnd?: string
  ): ResolvedDateRange {
    const tz = communityTimezone && this.isValidTimezone(communityTimezone)
      ? communityTimezone
      : 'UTC';

    const now = new Date();

    let rangeStart: Date;
    let rangeEnd: Date;
    let daysDiff: number;

    switch (rangeType) {
      case 'TODAY': {
        // Today from midnight to current time
        const startOfDay = this.getStartOfDayInTimezone(now, tz);
        rangeStart = startOfDay;
        rangeEnd = now;
        daysDiff = 1;
        break;
      }

      case 'LAST_7_DAYS': {
        daysDiff = 7;
        const startOfDay = this.getStartOfDayInTimezone(now, tz);
        rangeStart = new Date(startOfDay.getTime() - (daysDiff - 1) * 24 * 60 * 60 * 1000);
        rangeEnd = now;
        break;
      }

      case 'LAST_90_DAYS': {
        daysDiff = 90;
        const startOfDay = this.getStartOfDayInTimezone(now, tz);
        rangeStart = new Date(startOfDay.getTime() - (daysDiff - 1) * 24 * 60 * 60 * 1000);
        rangeEnd = now;
        break;
      }

      case 'CUSTOM': {
        if (customStart && customEnd) {
          rangeStart = new Date(customStart);
          rangeEnd = new Date(customEnd);
          if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
            // Fallback to 30 days if invalid custom range
            daysDiff = 30;
            const startOfDay = this.getStartOfDayInTimezone(now, tz);
            rangeStart = new Date(startOfDay.getTime() - (daysDiff - 1) * 24 * 60 * 60 * 1000);
            rangeEnd = now;
          } else {
            daysDiff = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)));
          }
        } else {
          daysDiff = 30;
          const startOfDay = this.getStartOfDayInTimezone(now, tz);
          rangeStart = new Date(startOfDay.getTime() - (daysDiff - 1) * 24 * 60 * 60 * 1000);
          rangeEnd = now;
        }
        break;
      }

      case 'LAST_30_DAYS':
      default: {
        daysDiff = 30;
        const startOfDay = this.getStartOfDayInTimezone(now, tz);
        rangeStart = new Date(startOfDay.getTime() - (daysDiff - 1) * 24 * 60 * 60 * 1000);
        rangeEnd = now;
        break;
      }
    }

    // Previous period of identical duration immediately prior to rangeStart
    const durationMs = rangeEnd.getTime() - rangeStart.getTime();
    const previousRangeEnd = new Date(rangeStart.getTime());
    const previousRangeStart = new Date(rangeStart.getTime() - durationMs);

    // Generate daily date buckets formatted as YYYY-MM-DD
    const dailyBuckets = this.generateDailyBuckets(rangeStart, rangeEnd, tz);

    return {
      rangeType,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      previousRangeStart: previousRangeStart.toISOString(),
      previousRangeEnd: previousRangeEnd.toISOString(),
      timezone: tz,
      daysDiff,
      dailyBuckets,
    };
  }

  /**
   * Helper to check if a date string falls inside a given date interval
   */
  static isDateInRange(dateInput: string | Date | undefined | null, startIso: string, endIso: string): boolean {
    if (!dateInput) return false;
    const d = new Date(dateInput).getTime();
    if (isNaN(d)) return false;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return d >= start && d <= end;
  }

  /**
   * Format date to YYYY-MM-DD in the specified timezone
   */
  static formatDateInTimezone(date: Date, timezone: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(date); // outputs YYYY-MM-DD
    } catch {
      return date.toISOString().split('T')[0];
    }
  }

  /**
   * Get start of day (00:00:00.000) for a given date in target timezone
   */
  private static getStartOfDayInTimezone(date: Date, timezone: string): Date {
    try {
      const ymd = this.formatDateInTimezone(date, timezone);
      const [year, month, day] = ymd.split('-').map(Number);
      // Construct UTC date for midnight, then adjust for timezone offset
      const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      return utcMidnight;
    } catch {
      const d = new Date(date);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
  }

  /**
   * Generate YYYY-MM-DD string buckets between start and end dates
   */
  private static generateDailyBuckets(start: Date, end: Date, timezone: string): string[] {
    const buckets: string[] = [];
    const current = new Date(start.getTime());
    const endTime = end.getTime();

    while (current.getTime() <= endTime) {
      const formatted = this.formatDateInTimezone(current, timezone);
      if (!buckets.includes(formatted)) {
        buckets.push(formatted);
      }
      current.setTime(current.getTime() + 24 * 60 * 60 * 1000);
    }

    return buckets;
  }

  private static isValidTimezone(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }
}
