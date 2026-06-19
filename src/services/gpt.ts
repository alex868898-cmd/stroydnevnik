import { Project, PriceCatalog, ParsedWorkLog } from '../lib/types';
import { supabase } from './supabase';

export async function parseWorkTranscript(
  transcript: string,
  projects: Project[],
  catalog: PriceCatalog[]
): Promise<ParsedWorkLog> {
  try {
    const { data, error } = await supabase.functions.invoke('gpt-proxy', {
      body: { transcript, projects, catalog },
    });

    if (error) {
      console.error('Error invoking gpt-proxy Edge Function:', error);
      throw new Error('Transcript parsing failed: ' + (error.message || JSON.stringify(error)));
    }

    if (!data) {
      throw new Error('No data returned from gpt-proxy');
    }

    // Edge Function returns either the JSON object directly or text.
    // If it's a string, we parse it. If it's already an object, use it directly.
    const parsedData = (typeof data === 'string' ? JSON.parse(data) : data) as ParsedWorkLog;

    // Ensure fields exist in returned objects
    if (!parsedData.segments) parsedData.segments = [];
    if (!parsedData.clarifications) parsedData.clarifications = [];

    return parsedData;
  } catch (error) {
    console.error('Error parsing transcript with GPT Edge Function:', error);
    throw error;
  }
}
