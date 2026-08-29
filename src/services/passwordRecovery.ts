import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../lib/constants';

export const PASSWORD_RECOVERY_REDIRECT = 'stroydnevnik://';

const RECOVERY_REQUEST_TTL_MS = 60 * 60 * 1000;

export interface PasswordRecoveryLink {
  isRecovery: boolean;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  error?: string;
}

function readParameters(value: string, target: Record<string, string>) {
  for (const pair of value.split('&')) {
    if (!pair) continue;

    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);

    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      const decodedValue = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      if (key) target[key] = decodedValue;
    } catch {
      // Ignore malformed fields while keeping the rest of the recovery URL usable.
    }
  }
}

export function parsePasswordRecoveryLink(url: string): PasswordRecoveryLink {
  const parameters: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  if (queryIndex !== -1) {
    readParameters(url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex), parameters);
  }
  if (hashIndex !== -1) {
    readParameters(url.slice(hashIndex + 1), parameters);
  }

  const error = parameters.error_description || parameters.error_code || parameters.error;

  return {
    isRecovery:
      parameters.type === 'recovery' ||
      url.toLocaleLowerCase().includes('reset-password'),
    accessToken: parameters.access_token,
    refreshToken: parameters.refresh_token,
    code: parameters.code,
    error,
  };
}

export async function markPasswordRecoveryRequested(): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.PASSWORD_RECOVERY_REQUESTED_AT,
    String(Date.now()),
  );
}

export async function hasPendingPasswordRecovery(): Promise<boolean> {
  const storedValue = await AsyncStorage.getItem(STORAGE_KEYS.PASSWORD_RECOVERY_REQUESTED_AT);
  const requestedAt = Number(storedValue);

  if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > RECOVERY_REQUEST_TTL_MS) {
    await clearPasswordRecoveryRequest();
    return false;
  }

  return true;
}

export async function clearPasswordRecoveryRequest(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REQUESTED_AT);
}
