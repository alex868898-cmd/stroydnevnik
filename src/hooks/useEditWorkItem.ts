import { useCallback } from 'react';
import { useWorkLogs } from './useWorkLogs';
import { WorkItem } from '../lib/types';

export function useEditWorkItem() {
  const { updateLogItems, removeLog, workLogs } = useWorkLogs();

  /**
   * Updates a single item at a specific index inside a work log
   */
  const editItem = useCallback(async (logId: string, itemIndex: number, updatedItem: WorkItem) => {
    const log = workLogs.find(l => l.id === logId);
    if (!log) throw new Error('Work log not found');

    const items = [...log.work_items];
    items[itemIndex] = {
      ...updatedItem,
      total: updatedItem.volume !== null && updatedItem.pricePerUnit !== null 
        ? updatedItem.volume * updatedItem.pricePerUnit 
        : null
    };
    
    await updateLogItems(logId, items);
  }, [workLogs, updateLogItems]);

  /**
   * Deletes a single item at a specific index inside a work log.
   * If it was the last item, deletes the entire work log.
   */
  const deleteItem = useCallback(async (logId: string, itemIndex: number) => {
    const log = workLogs.find(l => l.id === logId);
    if (!log) throw new Error('Work log not found');

    const items = log.work_items.filter((_, idx) => idx !== itemIndex);
    if (items.length === 0) {
      await removeLog(logId);
    } else {
      await updateLogItems(logId, items);
    }
  }, [workLogs, updateLogItems, removeLog]);

  return {
    editItem,
    deleteItem,
  };
}
