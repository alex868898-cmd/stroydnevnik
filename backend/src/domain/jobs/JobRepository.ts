import { GenerationJob } from './GenerationJob.js';
import { JobStatus } from './JobStatus.js';

export interface JobRepository {
  findById(id: string): Promise<GenerationJob | null>;
  save(job: GenerationJob): Promise<GenerationJob>;
  list(filter?: { status?: JobStatus; providerId?: string }): Promise<GenerationJob[]>;
  findNonTerminal(): Promise<GenerationJob[]>;
}
