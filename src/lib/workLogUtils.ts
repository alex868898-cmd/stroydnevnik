import { WorkLog, WorkItem } from './types';

/**
 * Calculates total earnings from a list of work items
 */
export function calculateItemsTotal(items: WorkItem[]): number {
  return items.reduce((acc, item) => {
    return acc + (item.total || 0);
  }, 0);
}

/**
 * Calculates total earnings from a single work log
 * Returns 0 if it is a day off
 */
export function calculateWorkLogEarnings(log: WorkLog): number {
  if (log.is_day_off) {
    return 0;
  }
  return calculateItemsTotal(log.work_items);
}

/**
 * Checks if a work item has a pending (unfilled) volume.
 * Rules: volume is null, and the action is NOT a service/delivery/meeting.
 */
export function isPendingVolumeItem(item: WorkItem): boolean {
  if (item.volume !== null && item.volume !== undefined) {
    return false;
  }
  const actionLower = (item.action || '').toLowerCase();
  
  // Exclude services, deliveries, meetings
  const isExcluded = 
    item.unit === 'послуга' || 
    actionLower.includes('доставка') || 
    actionLower.includes('занос') || 
    actionLower.includes('винесення') || 
    actionLower.includes('вивезення') || 
    actionLower.includes('зустріч') ||
    actionLower.includes('нарада') ||
    actionLower.includes('сервіс');
    
  return !isExcluded;
}

/**
 * Checks if a work log has any pending volumes
 */
export function hasPendingVolumes(log: WorkLog): boolean {
  if (log.is_day_off) return false;
  return log.work_items.some(isPendingVolumeItem);
}

/**
 * Gets a description list of items that require volume input
 */
export function getPendingVolumesDescription(log: WorkLog): string {
  if (log.is_day_off) return '';
  return log.work_items
    .filter(isPendingVolumeItem)
    .map(item => item.action)
    .join(', ');
}
