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
    super(`Job with ID '${jobId}' is in status '${currentStatus}', expected 'submitted' or 'processing'.`);
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

export class MissingProviderJobIdError extends Error {
  constructor(jobId: string) {
    super(`Job with ID '${jobId}' is missing providerJobId.`);
    this.name = 'MissingProviderJobIdError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MissingProviderJobIdError);
    }
  }
}

export class SucceededStateDeferredError extends Error {
  constructor(jobId: string) {
    super(`Job with ID '${jobId}' succeeded on provider, but transition to succeeded is deferred until asset download is implemented.`);
    this.name = 'SucceededStateDeferredError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SucceededStateDeferredError);
    }
  }
}

export class PollJobStatusUseCase {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly providerRegistry: ProviderRegistry
  ) {}

  /**
   * Polls the provider for the status of a submitted/processing job.
   * Mutates and saves job state for 'processing', 'failed', and 'cancelled' status.
   * Throws SucceededStateDeferredError without DB mutation if status is 'succeeded'.
   * 
   * @param jobId The database ID of the job to poll.
   * @returns The updated generation job.
   * @throws {JobNotFoundError} If the job is not found.
   * @throws {InvalidJobStatusError} If the job is in a terminal or queued state.
   * @throws {MissingProviderJobIdError} If providerJobId is missing.
   * @throws {ProviderNotFoundError} If the provider designated by the job is not registered.
   * @throws {SucceededStateDeferredError} If provider poll status is 'succeeded'.
   */
  async execute(jobId: string): Promise<GenerationJob> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (job.status !== JobStatus.SUBMITTED && job.status !== JobStatus.PROCESSING) {
      throw new InvalidJobStatusError(jobId, job.status);
    }

    if (!job.providerJobId) {
      throw new MissingProviderJobIdError(jobId);
    }

    const provider = this.providerRegistry.get(job.providerId);
    if (!provider) {
      throw new ProviderNotFoundError(job.providerId);
    }

    try {
      // Fetch normalized status from the provider adapter
      const result = await provider.poll(job.providerJobId);

      const now = new Date();

      switch (result.status) {
        case 'succeeded':
          // Transition to succeeded is deferred on this step. Do not mutate DB state.
          throw new SucceededStateDeferredError(jobId);

        case 'processing': {
          const updatedJob: GenerationJob = {
            ...job,
            status: JobStatus.PROCESSING,
            progress: result.progress ?? job.progress,
            updatedAt: now,
          };
          return await this.jobRepository.save(updatedJob);
        }

        case 'failed': {
          const updatedJob: GenerationJob = {
            ...job,
            status: JobStatus.FAILED,
            lastError: result.errorDetail ?? 'Provider job failed',
            updatedAt: now,
          };
          return await this.jobRepository.save(updatedJob);
        }

        case 'cancelled': {
          const updatedJob: GenerationJob = {
            ...job,
            status: JobStatus.CANCELLED,
            updatedAt: now,
          };
          return await this.jobRepository.save(updatedJob);
        }

        default:
          throw new Error(`Unexpected provider poll status: ${result.status}`);
      }
    } catch (error) {
      // If it is the deferred success error, re-throw it without DB modifications
      if (error instanceof SucceededStateDeferredError) {
        throw error;
      }

      // Check if it is a terminal ProviderError
      const isTerminalProviderError =
        error instanceof ProviderError &&
        (error.category === ProviderErrorCategory.VALIDATION_ERROR ||
          error.category === ProviderErrorCategory.AUTH_ERROR);

      if (isTerminalProviderError) {
        const now = new Date();

        const failedJob: GenerationJob = {
          ...job,
          status: JobStatus.FAILED,
          lastError: (error as Error).message,
          updatedAt: now,
        };

        await this.jobRepository.save(failedJob);
      }

      // Re-throw all errors
      throw error;
    }
  }
}
