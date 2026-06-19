/**
 * Formats a number as UAH currency (e.g. 1 500 грн)
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 грн';
  }
  
  // Format with space separator for thousands and no decimal place if it is a whole number
  const rounded = Math.round(amount * 100) / 100;
  const parts = rounded.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  const formattedNumber = parts.join('.');
  return `${formattedNumber} грн`;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into user friendly Ukrainian text
 * e.g. "19 червня 2026" or "19.06.2026"
 */
export function formatDate(dateInput: string | Date | null | undefined, formatType: 'full' | 'short' | 'day_month' = 'short'): string {
  if (!dateInput) return '';
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  if (formatType === 'short') {
    return `${day}.${month}.${year}`;
  }

  const ukrainianMonths = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];

  if (formatType === 'day_month') {
    return `${date.getDate()} ${ukrainianMonths[date.getMonth()]}`;
  }

  return `${date.getDate()} ${ukrainianMonths[date.getMonth()]} ${year} р.`;
}

/**
 * Gets day name of week in Ukrainian
 */
export function getDayOfWeekName(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const days = [
    'Неділя',
    'Понеділок',
    'Вівторок',
    'Середа',
    'Четвер',
    'П\'ятниця',
    'Субота'
  ];
  return days[date.getDay()];
}
