import { supabase } from './supabase';

/**
 * Transcribes an audio file URI using Supabase Edge Function whisper-proxy.
 * Reads the local audio file into a raw Blob using XMLHttpRequest (compatible with React Native).
 */
export async function transcribeAudio(fileUri: string): Promise<string> {
  // Clean file URI for Android/iOS
  let cleanUri = fileUri;
  if (!cleanUri.startsWith('file://') && !cleanUri.startsWith('content://')) {
    cleanUri = 'file://' + cleanUri;
  }

  // Read local file as a raw Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error('Cannot read file: ' + cleanUri));
    xhr.responseType = 'blob';
    xhr.open('GET', cleanUri);
    xhr.send();
  });

  const { data, error } = await supabase.functions.invoke('whisper-proxy', {
    body: blob,
    headers: {
      'Content-Type': 'audio/m4a',
    },
  });

  if (error) {
    console.error('Error in whisper-proxy function invocation:', error);
    throw new Error('Transcription failed: ' + (error.message || JSON.stringify(error)));
  }

  if (!data || !data.text) {
    throw new Error('No transcription text returned from proxy');
  }

  return data.text;
}


