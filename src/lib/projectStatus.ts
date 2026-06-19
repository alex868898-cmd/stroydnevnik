import { COLORS } from './constants';

export type ProjectStatus = 'active' | 'paused' | 'frozen' | 'completed';

export interface StatusInfo {
  label: string;
  emoji: string;
  color: string;
}

export const PROJECT_STATUS_MAP: Record<ProjectStatus, StatusInfo> = {
  active: {
    label: 'Активний',
    emoji: '🟢',
    color: COLORS.active,
  },
  paused: {
    label: 'Призупинений',
    emoji: '⏸',
    color: COLORS.paused,
  },
  frozen: {
    label: 'Заморожений',
    emoji: '❄️',
    color: COLORS.frozen,
  },
  completed: {
    label: 'Завершений',
    emoji: '✅',
    color: COLORS.completed,
  },
};

export const getStatusInfo = (status: string): StatusInfo => {
  const normStatus = (status || 'active') as ProjectStatus;
  return PROJECT_STATUS_MAP[normStatus] || PROJECT_STATUS_MAP.active;
};
