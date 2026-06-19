export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

export type PeriodType = 'week' | 'month' | 'custom';

/**
 * Generates predefined date ranges based on type
 * YYYY-MM-DD strings are returned in local timezone
 */
export function getDateRange(type: PeriodType, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  const formatLocalDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = formatLocalDate(now);

  switch (type) {
    case 'week': {
      // Get current day of week (0-6, Sunday is 0)
      const currentDay = now.getDay();
      // Calculate days to subtract to get to Monday (if Sun (0), subtract 6 days)
      const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      return {
        startDate: formatLocalDate(monday),
        endDate: formatLocalDate(sunday),
        label: 'За поточний тиждень',
      };
    }
    case 'month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      return {
        startDate: formatLocalDate(firstDay),
        endDate: formatLocalDate(lastDay),
        label: 'За поточний місяць',
      };
    }
    case 'custom': {
      if (customStart && customEnd) {
        return {
          startDate: customStart,
          endDate: customEnd,
          label: 'Довільний період',
        };
      }
      return {
        startDate: todayStr,
        endDate: todayStr,
        label: 'Сьогодні',
      };
    }
    default:
      return {
        startDate: todayStr,
        endDate: todayStr,
        label: 'Сьогодні',
      };
  }
}
