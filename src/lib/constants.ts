export const STORAGE_KEYS = {
  SELECTED_PROJECT_ID: 'selected_project_id',
  REMINDER_HOUR: 'reminder_hour',
  REMINDER_MINUTE: 'reminder_minute',
  LAST_LOG_DATE: 'last_log_date',
  PENDING_VOLUMES_DESC: 'pending_volumes_desc',
  PENDING_VOLUMES_DATE: 'pending_volumes_date',
  WEEKLY_REMINDER_DAY: 'weekly_reminder_day',
  WEEKLY_REMINDER_HOUR: 'weekly_reminder_hour',
  WEEKLY_REMINDER_ENABLED: 'weekly_reminder_enabled',
  WEEKLY_PERIOD_TYPE: 'weekly_period_type', // 'workweek' | 'fullweek'
  LAST_PDF_WEEK: 'last_pdf_week',
  WEEKLY_REMINDER_SNOOZE: 'weekly_reminder_snooze',
  BIOMETRIC_ENABLED: 'biometric_enabled', // 'true' | 'false'
  PIN_HASH_ENCRYPTED: 'pin_hash_encrypted',
  CONTRACTOR_NAME: 'contractor_name',
  CONTRACTOR_PHONE: 'contractor_phone',
  PASSWORD_RECOVERY_REQUESTED_AT: 'password_recovery_requested_at',
};

export const COLORS = {
  // Sleek Dark-Mode Color Palette
  background: '#0F172A', // Slate 900
  card: '#1E293B', // Slate 800
  cardBorder: '#334155', // Slate 700
  text: '#F8FAFC', // Slate 50
  textSecondary: '#94A3B8', // Slate 400
  textMuted: '#64748B', // Slate 500
  
  // Brand / Accents
  primary: '#3B82F6', // Vibrant Blue
  primaryDark: '#2563EB',
  accent: '#10B981', // Emerald Green (success/earnings)
  warning: '#F59E0B', // Amber
  danger: '#EF4444', // Red
  
  // Status Colors (Projects)
  active: '#10B981',   // Emerald
  paused: '#F59E0B',   // Amber
  frozen: '#38BDF8',   // Light Blue (Ice)
  completed: '#6366F1', // Indigo
};

export const DEFAULT_NOTIFICATIONS = {
  REMINDER_HOUR: 20, // 20:00 (8 PM)
  REMINDER_MINUTE: 0,
  WEEKLY_DAY: 5, // Friday (5)
  WEEKLY_HOUR: 19, // 19:00 (7 PM)
};
