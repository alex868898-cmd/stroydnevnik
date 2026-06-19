import { hasPinSet } from './pinAuth';
import { isBiometricEnabled } from './biometricAuth';

/**
 * Checks if the user has enabled any form of local security (PIN or Biometrics)
 */
export async function isLocalSecurityEnabled(): Promise<boolean> {
  const pinSet = await hasPinSet();
  const bioEnabled = await isBiometricEnabled();
  return pinSet || bioEnabled;
}

/**
 * Checks if local authentication needs to be prompted upon launch.
 * True if user is logged in (session exists) and local security is enabled.
 */
export async function shouldPromptLocalAuth(hasSession: boolean): Promise<boolean> {
  if (!hasSession) return false;
  return await isLocalSecurityEnabled();
}
