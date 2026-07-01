import { GenerationRequest } from './GenerationRequest.js';
import { JobStatus } from './JobStatus.js';

export interface GenerationJob {
  id: string;
  request: GenerationRequest;
  status: JobStatus;
  providerId: string;
  providerJobId?: string | null;
  attempts: number;
  lastError?: string | null;
  resultAssetId?: string | null;
  progress?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
