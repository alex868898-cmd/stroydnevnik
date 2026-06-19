import { supabase } from './supabase';

/**
 * Transcribes an audio file URI using Supabase Edge Function whisper-proxy
 */
export async function transcribeAudio(fileUri: string): Promise<string> {
  // Clean file URI for Android/iOS
  let cleanUri = fileUri;
  if (!cleanUri.startsWith('file://') && !cleanUri.startsWith('content://')) {
    cleanUri = 'file://' + cleanUri;
  }

  const formData = new FormData();
  
  // React Native FormData file attachment pattern
  formData.append('file', {
    uri: cleanUri,
    type: 'audio/mp4',
    name: 'recording.m4a',
  } as any);

  const { data, error } = await supabase.functions.invoke('whisper-proxy', {
    body: formData,
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

