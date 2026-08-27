import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Project, WorkLog, PriceCatalog, EstimateHistory, WorkItem } from '../lib/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// =========================================================================
// Price Catalog In-Memory Cache
// =========================================================================
let catalogCache: PriceCatalog[] | null = null;

export async function getPriceCatalog(forceRefresh = false): Promise<PriceCatalog[]> {
  if (catalogCache && !forceRefresh) {
    return catalogCache;
  }
  
  const [{ data, error }, { data: statistics, error: statisticsError }] = await Promise.all([
    supabase.from('price_catalog').select('*').order('work_type', { ascending: true }),
    supabase.from('price_statistics').select('work_type, price, unit'),
  ]);
    
  if (error) {
    console.error('Error fetching price catalog:', error);
    throw error;
  }
  
  if (statisticsError) console.warn('Unable to include uploaded prices:', statisticsError);
  const merged = new Map<string, PriceCatalog>();
  for (const row of data || []) {
    const key = row.work_type.trim().toLocaleLowerCase('uk-UA');
    const current = merged.get(key);
    if (!current || Number(row.base_price) > Number(current.base_price)) merged.set(key, row);
  }
  for (const row of statistics || []) {
    const key = row.work_type.trim().toLocaleLowerCase('uk-UA');
    const current = merged.get(key);
    if (!current || Number(row.price) > Number(current.base_price)) {
      merged.set(key, {
        id: current?.id || `statistics:${key}`,
        work_type: row.work_type,
        unit: row.unit || current?.unit || 'послуга',
        unit_type: current?.unit_type || (row.unit === 'м²' ? 'sq_m' : row.unit === 'п.м' ? 'lm' : 'service'),
        base_price: Number(row.price),
        region: current?.region || 'Україна',
      } as PriceCatalog);
    }
  }
  catalogCache = Array.from(merged.values()).sort((a, b) => a.work_type.localeCompare(b.work_type, 'uk'));
  return catalogCache;
}

export function clearCatalogCache() {
  catalogCache = null;
}

// =========================================================================
// Projects CRUD
// =========================================================================
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
  return data || [];
}

export async function createProject(name: string, address?: string): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data, error } = await supabase
    .from('projects')
    .insert([{ name, address, status: 'active', user_id: userId }])
    .select()
    .single();
    
  if (error) {
    console.error('Error creating project:', error);
    throw error;
  }
  return data;
}

export async function updateProjectStatus(id: string, status: Project['status']): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    console.error('Error updating project status:', error);
    throw error;
  }
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

// =========================================================================
// Work Logs CRUD
// =========================================================================
export async function getTodayWorkLogs(dateStr?: string): Promise<WorkLog[]> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('work_logs')
    .select('*')
    .eq('work_date', targetDate);
    
  if (error) {
    console.error('Error fetching today work logs:', error);
    throw error;
  }
  return data || [];
}

export async function getWorkLogsForProject(projectId: string, startDate?: string, endDate?: string): Promise<WorkLog[]> {
  let query = supabase
    .from('work_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('work_date', { ascending: true });
    
  if (startDate) {
    query = query.gte('work_date', startDate);
  }
  if (endDate) {
    query = query.lte('work_date', endDate);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching project work logs:', error);
    throw error;
  }
  return data || [];
}

export async function saveWorkLog(log: Omit<WorkLog, 'id' | 'user_id' | 'created_at'>): Promise<WorkLog> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data, error } = await supabase
    .from('work_logs')
    .insert([{ ...log, user_id: userId }])
    .select()
    .single();
    
  if (error) {
    console.error('Error saving work log:', error);
    throw error;
  }
  return data;
}

export async function updateWorkLogItems(id: string, items: WorkItem[], totalAmount: number): Promise<WorkLog> {
  const { data, error } = await supabase
    .from('work_logs')
    .update({ work_items: items, total_amount: totalAmount })
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    console.error('Error updating work log items:', error);
    throw error;
  }
  return data;
}

export async function updateWorkLogProject(id: string, projectId: string | null): Promise<WorkLog> {
  const { data, error } = await supabase
    .from('work_logs')
    .update({ project_id: projectId })
    .eq('id', id)
    .select()
    .single();
    
  if (error) {
    console.error('Error updating work log project:', error);
    throw error;
  }
  return data;
}

export async function deleteWorkLog(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_logs')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error('Error deleting work log:', error);
    throw error;
  }
}

// =========================================================================
// Estimate History CRUD
// =========================================================================
export async function getLatestEstimateHistory(projectId: string): Promise<EstimateHistory | null> {
  const { data, error } = await supabase
    .from('estimate_history')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (error) {
    console.error('Error fetching latest estimate history:', error);
    throw error;
  }
  return data && data.length > 0 ? data[0] : null;
}

export async function createEstimateHistory(
  projectId: string, 
  lastWorkLogId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<EstimateHistory> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data, error } = await supabase
    .from('estimate_history')
    .insert([{
      project_id: projectId,
      last_work_log_id: lastWorkLogId,
      period_start: periodStart,
      period_end: periodEnd,
      user_id: userId
    }])
    .select()
    .single();
    
  if (error) {
    console.error('Error creating estimate history:', error);
    throw error;
  }
  return data;
}
