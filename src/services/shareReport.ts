import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Shares a local file (PDF or CSV) using the native sharing sheet
 */
export async function shareReportFile(fileUri: string, mimeType: string, dialogTitle = 'Поділитися кошторисом'): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Обмін локальними файлами недоступний у веб-версії');
  }

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error('Згенерований файл не знайдено');
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Системне меню надсилання недоступне на цьому пристрої');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType,
    dialogTitle,
    UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'com.adobe.pdf',
  });
}
