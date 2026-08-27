import { transcribeAudio } from './whisper';
import { parseWorkTranscript } from './gpt';
import { getProjects, getPriceCatalog, saveWorkLog } from './supabase';
import { ParsedWorkLog, ParsedSegment, WorkLog } from '../lib/types';
import { calculateItemsTotal, hasPendingVolumes } from '../lib/workLogUtils';

export interface VoicePipelineResult {
  transcript: string;
  parsedLog: ParsedWorkLog;
}

/**
 * Runs the transcription and GPT parsing pipeline.
 * Returns the transcript and structured parse result (including clarifications).
 */
export async function runVoicePipeline(audioUri: string): Promise<VoicePipelineResult> {
  // 1. Transcribe audio
  const transcript = await transcribeAudio(audioUri);
  if (!transcript.trim()) {
    throw new Error('Не вдалося розпізнати голос (порожній текст)');
  }

  // 2. Fetch projects and catalog in parallel
  const [projects, catalog] = await Promise.all([
    getProjects(),
    getPriceCatalog()
  ]);

  // 3. Parse with GPT
  const parsedLog = await parseWorkTranscript(transcript, projects, catalog);

  return {
    transcript,
    parsedLog
  };
}

/**
 * Runs the same parsing pipeline for text entered in the compact composer.
 */
export async function runTextPipeline(text: string): Promise<ParsedWorkLog> {
  const transcript = text.trim();
  if (!transcript) {
    throw new Error('Введіть опис виконаних робіт');
  }

  const [projects, catalog] = await Promise.all([
    getProjects(),
    getPriceCatalog(),
  ]);

  return parseWorkTranscript(transcript, projects, catalog);
}

/**
 * Saves parsed segments to Supabase as individual work logs.
 * Returns the created WorkLog objects.
 */
export async function saveParsedSegments(
  segments: ParsedSegment[],
  transcript: string,
  workDateStr?: string
): Promise<WorkLog[]> {
  const targetDate = workDateStr || new Date().toISOString().split('T')[0];
  const savedLogs: WorkLog[] = [];

  for (const segment of segments) {
    // If no project matched and no hint provided, ignore or assign to null
    const projectId = segment.projectId;
    const items = segment.items;
    
    if (items.length === 0) continue;

    const totalAmount = calculateItemsTotal(items);
    // Volumes are confirmed if none of the items are pending volume input
    const nonePending = items.every(item => {
      // Exclude services/deliveries from pending volume check
      const actionLower = (item.action || '').toLowerCase();
      const isExcluded = 
        item.unit === 'послуга' || 
        actionLower.includes('доставка') || 
        actionLower.includes('занос') || 
        actionLower.includes('винесення') || 
        actionLower.includes('вивезення') || 
        actionLower.includes('зустріч');
      return item.volume !== null || isExcluded;
    });

    const workLogData: Omit<WorkLog, 'id' | 'user_id' | 'created_at'> = {
      project_id: projectId,
      work_date: targetDate,
      voice_transcript: transcript,
      work_items: items,
      total_amount: totalAmount,
      volumes_confirmed: nonePending,
      is_day_off: false
    };

    const savedLog = await saveWorkLog(workLogData);
    savedLogs.push(savedLog);
  }

  return savedLogs;
}
