import { JobRepository } from '../../domain/jobs/JobRepository.js';
import { GenerationJob } from '../../domain/jobs/GenerationJob.js';
import { JobStatus } from '../../domain/jobs/JobStatus.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ProviderError, ProviderErrorCategory } from '../../domain/providers/ProviderError.js';

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job with ID '${jobId}' not found.`);
    this.name = 'JobNotFoundError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JobNotFoundError);
    }
  }
}

export class InvalidJobStatusError extends Error {
  constructor(jobId: string, currentStatus: string) {
    super(`Job with ID '${jobId}' is in status '${currentStatus}', expected 'queued'.`);
    this.name = 'InvalidJobStatusError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidJobStatusError);
    }
  }
}

export class ProviderNotFoundError extends Error {
  constructor(providerId: string) {
    super(`Provider with ID '${providerId}' not found in registry.`);
    this.name = 'ProviderNotFoundError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderNotFoundError);
    }
  }
}

export class SubmitJobToProviderUseCase {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly providerRegistry: ProviderRegistry
  ) {}

  /**
   * Submits a queued generation job to its designated provider adapter.
   * Updates state to 'submitted' on success, or 'failed' on terminal errors.
   * Leaves the job in its current state ('queued') for transient errors.
   * 
   * @param jobId The database ID of the job to submit.
   * @returns The updated generation job.
   * @throws {JobNotFoundError} If the job is not found.
   * @throws {InvalidJobStatusError} If the job is not in a 'queued' state.
   * @throws {ProviderNotFoundError} If the provider designated by the job is not registered.
   */
  async execute(jobId: string): Promise<GenerationJob> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (job.status !== JobStatus.QUEUED) {
      throw new InvalidJobStatusError(jobId, job.status);
    }

    const provider = this.providerRegistry.get(job.providerId);
    if (!provider) {
      throw new ProviderNotFoundError(job.providerId);
    }

    try {
      // Call provider submission (async)
      const { providerJobId } = await provider.submit(job.request);

      const now = new Date();
      
      // Update job state for successful submission
      const updatedJob: GenerationJob = {
        ...job,
        status: JobStatus.SUBMITTED,
        providerJobId,
        attempts: job.attempts + 1,
        updatedAt: now,
      };

      return await this.jobRepository.save(updatedJob);
    } catch (error) {
      const isTerminalProviderError = 
        error instanceof ProviderError && 
        (error.category === ProviderErrorCategory.VALIDATION_ERROR || 
         error.category === ProviderErrorCategory.AUTH_ERROR);

      if (isTerminalProviderError) {
        const now = new Date();
        
        // Update job state to FAILED for terminal provider errors
        const failedJob: GenerationJob = {
          ...job,
          status: JobStatus.FAILED,
          lastError: (error as Error).message,
          attempts: job.attempts + 1,
          updatedAt: now,
        };

        await this.jobRepository.save(failedJob);
      }

      // Re-throw all errors (both transient and terminal) to the caller
      throw error;
    }
  }
}
