import { PermissionsAndroid, Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

export type MicrophonePermissionResult = 'granted' | 'denied' | 'blocked';

export async function hasMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  }

  const permission = await getRecordingPermissionsAsync();
  return permission.granted;
}

/**
 * Requests the platform microphone permission.
 *
 * Android deliberately uses PermissionsAndroid directly. This guarantees that
 * the native Android permission sheet is shown instead of relying only on the
 * Expo permission wrapper.
 */
export async function requestMicrophonePermission(): Promise<MicrophonePermissionResult> {
  if (Platform.OS === 'android') {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

    if (await PermissionsAndroid.check(permission)) {
      return 'granted';
    }

    const result = await PermissionsAndroid.request(permission, {
      title: 'Доступ до мікрофона',
      message: 'KOSHTOR потрібен доступ до мікрофона для голосового введення виконаних робіт.',
      buttonPositive: 'Дозволити',
      buttonNegative: 'Заборонити',
      buttonNeutral: 'Пізніше',
    });

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      return 'granted';
    }

    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      return 'blocked';
    }

    return 'denied';
  }

  const current = await getRecordingPermissionsAsync();
  if (current.granted) {
    return 'granted';
  }

  if (!current.canAskAgain) {
    return 'blocked';
  }

  const requested = await requestRecordingPermissionsAsync();
  if (requested.granted) {
    return 'granted';
  }

  return requested.canAskAgain ? 'denied' : 'blocked';
}
