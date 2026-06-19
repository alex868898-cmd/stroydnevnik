import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

/**
 * Shares a local file (PDF or CSV) using the native sharing sheet
 */
export async function shareReportFile(fileUri: string, mimeType: string, dialogTitle = 'Поділитися кошторисом'): Promise<void> {
  if (Platform.OS === 'web') {
    Alert.alert('Обмеження', 'Ділення файлами недоступне у веб-версії');
    return;
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    Alert.alert('Помилка', 'Ділення файлами недоступне на цьому пристрої');
    return;
  }

  try {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle,
      UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing file:', error);
    Alert.alert('Помилка', 'Не вдалося надіслати файл');
  }
}
