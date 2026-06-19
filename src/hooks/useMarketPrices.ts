import { useState, useEffect, useCallback } from 'react';
import { PriceCatalog } from '../lib/types';
import { getPriceCatalog, supabase, clearCatalogCache } from '../services/supabase';

export function useMarketPrices() {
  const [catalog, setCatalog] = useState<PriceCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCatalog = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const data = await getPriceCatalog(force);
      setCatalog(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  /**
   * Adds a custom price catalog entry for the current user
   */
  const addCustomPrice = useCallback(async (
    workType: string, 
    unit: string, 
    unitType: PriceCatalog['unit_type'], 
    basePrice: number,
    region = 'Україна'
  ) => {
    try {
      const { data, error } = await supabase
        .from('price_catalog')
        .insert([{ 
          work_type: workType, 
          unit, 
          unit_type: unitType, 
          base_price: basePrice, 
          region 
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Clear cache and refresh
      clearCatalogCache();
      await fetchCatalog(true);
      return data;
    } catch (err) {
      console.error('Error adding custom price:', err);
      throw err;
    }
  }, [fetchCatalog]);

  return {
    catalog,
    loading,
    error,
    refresh: () => fetchCatalog(true),
    addCustomPrice,
  };
}
