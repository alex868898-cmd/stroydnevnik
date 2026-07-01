export type UseCase = 'text-to-video' | 'image-to-video' | 'avatar';

export interface GenerationParams {
  duration?: number;
  aspectRatio?: string;
  seed?: number;
}

export interface GenerationRequest {
  useCase: UseCase;
  prompt: string;
  providerId: string;
  pipelineId?: string;
  params?: GenerationParams;
  presetId?: string | null;
}
