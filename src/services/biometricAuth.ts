import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../lib/constants';

/**
 * Checks if biometric authentication hardware is available on the device
 */
export async function isBiometricHardwareAvailable(): Promise<boolean> {
  return await LocalAuthentication.hasHardwareAsync();
}

/**
 * Checks if the user has enrolled biometrics (touch id / face id)
 */
export async function isBiometricEnrolled(): Promise<boolean> {
  return await LocalAuthentication.isEnrolledAsync();
}

/**
 * Checks if biometrics are enabled in application settings
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const enabled = await AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
  return enabled === 'true';
}

/**
 * Enables or disables biometrics in application settings
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
}

/**
 * Triggers native biometric authentication prompt
 */
export async function authenticateBiometrics(promptMessage = 'Вхід до KOSHTOR'): Promise<boolean> {
  const isEnrolled = await isBiometricEnrolled();
  if (!isEnrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: 'Ввести PIN',
    disableDeviceFallback: true, // we want to fallback to our own PIN screen
  });

  return result.success;
}
