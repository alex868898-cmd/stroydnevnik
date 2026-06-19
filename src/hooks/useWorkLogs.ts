import { useState, useEffect, useCallback } from 'react';
import { WorkLog, WorkItem } from '../lib/types';
import * as db from '../services/supabase';
import { calculateItemsTotal } from '../lib/workLogUtils';

// Module-level in-memory cache to persist between tab switches
let cachedTodayLogs: WorkLog[] | null = null;
let listeners: Array<(logs: WorkLog[]) => void> = [];

const updateCache = (newLogs: WorkLog[]) => {
  cachedTodayLogs = newLogs;
  listeners.forEach(listener => listener(newLogs));
};

export function useWorkLogs(dateStr?: string) {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const isToday = targetDate === new Date().toISOString().split('T')[0];

  const [workLogs, setWorkLogs] = useState<WorkLog[]>(isToday && cachedTodayLogs ? cachedTodayLogs : []);
  const [loading, setLoading] = useState(isToday ? !cachedTodayLogs : true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isToday) return;

    const listener = (updatedLogs: WorkLog[]) => {
      setWorkLogs(updatedLogs);
    };
    listeners.push(listener);
    
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, [isToday]);

  const fetchWorkLogs = useCallback(async (force = false) => {
    if (isToday && cachedTodayLogs && !force) {
      setWorkLogs(cachedTodayLogs);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await db.getTodayWorkLogs(targetDate);
      if (isToday) {
        updateCache(data);
      } else {
        setWorkLogs(data);
      }
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [targetDate, isToday]);

  useEffect(() => {
    fetchWorkLogs();
  }, [fetchWorkLogs]);

  const saveLog = useCallback(async (logData: Omit<WorkLog, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const saved = await db.saveWorkLog(logData);
      if (isToday && cachedTodayLogs) {
        updateCache([saved, ...cachedTodayLogs]);
      }
      return saved;
    } catch (err) {
      console.error('Error saving work log:', err);
      throw err;
    }
  }, [isToday]);

  const updateLogItems = useCallback(async (logId: string, items: WorkItem[]) => {
    try {
      const totalAmount = calculateItemsTotal(items);
      const updated = await db.updateWorkLogItems(logId, items, totalAmount);
      if (isToday && cachedTodayLogs) {
        updateCache(cachedTodayLogs.map(l => l.id === logId ? updated : l));
      }
      return updated;
    } catch (err) {
      console.error('Error updating work items:', err);
      throw err;
    }
  }, [isToday]);

  const removeLog = useCallback(async (logId: string) => {
    try {
      await db.deleteWorkLog(logId);
      if (isToday && cachedTodayLogs) {
        updateCache(cachedTodayLogs.filter(l => l.id !== logId));
      }
    } catch (err) {
      console.error('Error deleting work log:', err);
      throw err;
    }
  }, [isToday]);

  /**
   * Moves a work item from one project to another.
   * Business Rule:
   * - If the work log has only 1 item -> update project_id of the work log.
   * - If it has multiple items -> split it: create a new work log with that 1 item, and update the original work log to remove that item.
   */
  const moveWorkItem = useCallback(async (logId: string, itemIndex: number, targetProjectId: string | null) => {
    if (isToday && !cachedTodayLogs) return;
    
    // Find the log
    const logsList = isToday && cachedTodayLogs ? cachedTodayLogs : workLogs;
    const log = logsList.find(l => l.id === logId);
    if (!log) return;

    const items = [...log.work_items];
    if (itemIndex < 0 || itemIndex >= items.length) return;

    const itemToMove = items[itemIndex];

    if (items.length === 1) {
      // 1. Single item log -> update project_id
      try {
        const updated = await db.updateWorkLogProject(logId, targetProjectId);
        if (isToday && cachedTodayLogs) {
          updateCache(cachedTodayLogs.map(l => l.id === logId ? updated : l));
        }
      } catch (err) {
        console.error('Error moving single item project:', err);
        throw err;
      }
    } else {
      // 2. Multiple items log -> Split
      const remainingItems = items.filter((_, idx) => idx !== itemIndex);
      const remainingTotal = calculateItemsTotal(remainingItems);

      try {
        // Save the split-off item in a new work log
        const splitLogData: Omit<WorkLog, 'id' | 'user_id' | 'created_at'> = {
          project_id: targetProjectId,
          work_date: log.work_date,
          voice_transcript: `Перенесено з попереднього запису: "${itemToMove.action}"`,
          work_items: [itemToMove],
          total_amount: itemToMove.total || 0,
          volumes_confirmed: itemToMove.volume !== null,
          is_day_off: false,
        };
        const newLog = await db.saveWorkLog(splitLogData);

        // Update the original log with the remaining items
        const updatedOriginal = await db.updateWorkLogItems(logId, remainingItems, remainingTotal);

        if (isToday && cachedTodayLogs) {
          const nextLogs = cachedTodayLogs
            .map(l => l.id === logId ? updatedOriginal : l);
          updateCache([newLog, ...nextLogs]);
        }
      } catch (err) {
        console.error('Error splitting work log for move:', err);
        throw err;
      }
    }
  }, [workLogs, isToday]);

  return {
    workLogs,
    loading,
    error,
    refresh: () => fetchWorkLogs(true),
    saveLog,
    updateLogItems,
    removeLog,
    moveWorkItem,
  };
}

export function clearWorkLogsCache() {
  cachedTodayLogs = null;
}
