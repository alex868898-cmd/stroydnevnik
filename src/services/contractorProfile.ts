import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../lib/constants';
import { supabase } from './supabase';

export interface ContractorProfile {
  name: string;
  phone: string;
}

export async function getContractorProfile(): Promise<ContractorProfile> {
  const [name, phone] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.CONTRACTOR_NAME),
    AsyncStorage.getItem(STORAGE_KEYS.CONTRACTOR_PHONE),
  ]);
  const local = { name: name || '', phone: phone || '' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;

  const { data, error } = await supabase
    .from('contractor_profiles')
    .select('name, phone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) return local;

  const cloud = { name: data.name || '', phone: data.phone || '' };
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.CONTRACTOR_NAME, cloud.name],
    [STORAGE_KEYS.CONTRACTOR_PHONE, cloud.phone],
  ]);
  return cloud;
}

export async function saveContractorProfile(profile: ContractorProfile) {
  const normalized = { name: profile.name.trim(), phone: profile.phone.trim() };
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.CONTRACTOR_NAME, normalized.name],
    [STORAGE_KEYS.CONTRACTOR_PHONE, normalized.phone],
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('contractor_profiles').upsert({
    user_id: user.id,
    ...normalized,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
