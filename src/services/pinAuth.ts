import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../lib/constants';

/**
 * Hashes a string using SHA-256
 */
async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
}

/**
 * Checks if the user has a PIN code set up
 */
export async function hasPinSet(): Promise<boolean> {
  const hash = await AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH_ENCRYPTED);
  return !!hash;
}

/**
 * Saves a new PIN code
 */
export async function setPin(pin: string): Promise<void> {
  if (pin.length < 4) {
    throw new Error('PIN-код повинен складатися щонайменше з 4 цифр');
  }
  const hash = await hashPin(pin);
  await AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH_ENCRYPTED, hash);
}

/**
 * Verifies a PIN code against the stored hash
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = await AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH_ENCRYPTED);
  if (!storedHash) return false;
  
  const hash = await hashPin(pin);
  return hash === storedHash;
}

/**
 * Deletes the stored PIN code
 */
export async function deletePin(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.PIN_HASH_ENCRYPTED);
}
