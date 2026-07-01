import { randomUUID } from 'crypto';
import { JobRepository } from '../../domain/jobs/JobRepository.js';
import { GenerationJob } from '../../domain/jobs/GenerationJob.js';
import { JobStatus } from '../../domain/jobs/JobStatus.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ProviderError, ProviderErrorCategory } from '../../domain/providers/ProviderError.js';
import { AssetDownloader, DownloadedAssetValidationError } from '../../domain/assets/AssetDownloader.js';
import { AssetStorage } from '../../domain/assets/AssetStorage.js';
import { AssetRepository } from '../../domain/assets/AssetRepository.js';
import { AssetPathPolicy } from '../../domain/assets/AssetPathPolicy.js';

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

export class PollJobStatusUseCase {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly providerRegistry: ProviderRegistry,
    private readonly assetDownloader: AssetDownloader,
    private readonly assetStorage: AssetStorage,
    private readonly assetRepository: AssetRepository
  ) {}

  /**
   * Polls the provider for the status of a submitted/processing job.
   * On 'succeeded': downloads, validates, stores the asset, registers it in the repo, and transitions the job to SUCCEEDED.
   * On 'failed' or 'cancelled': transitions the job to FAILED or CANCELLED.
   * On 'processing': updates the job's progress.
   * 
   * @param jobId The database ID of the job to poll.
   * @returns The updated generation job.
   * @throws {JobNotFoundError} If the job is not found.
   * @throws {InvalidJobStatusError} If the job is in a terminal or queued state.
   * @throws {MissingProviderJobIdError} If providerJobId is missing.
   * @throws {ProviderNotFoundError} If the provider designated by the job is not registered.
   * @throws {DownloadedAssetValidationError} Re-thrown for terminal download errors after marking the job as FAILED.
   * @throws {Error} Re-thrown for transient errors (no DB status mutation).
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
        case 'succeeded': {
          const assetUrl = result.assetUrl;
          if (!assetUrl) {
            throw new DownloadedAssetValidationError('Provider reported success but returned no asset URL.');
          }

          // Download the asset from the remote provider
          const downloaded = await this.assetDownloader.download(assetUrl);

          // Get a safe storage path (protects against path traversal via filename sanitization)
          const storagePath = AssetPathPolicy.getGeneratedAssetPath(jobId, downloaded.filename);

          // Save file data to the filesystem storage
          await this.assetStorage.save(storagePath, downloaded.data);

          // Generate UUID and persist metadata reference to database
          const assetId = randomUUID();
          await this.assetRepository.save({
            id: assetId,
            path: storagePath,
            mimeType: downloaded.mimeType,
            sizeBytes: downloaded.sizeBytes,
            sourceJobId: jobId,
            createdAt: now,
            kind: 'generated',
          });

          // Transition job to succeeded status
          const updatedJob: GenerationJob = {
            ...job,
            status: JobStatus.SUCCEEDED,
            progress: 1.0,
            resultAssetId: assetId,
            updatedAt: now,
          };
          return await this.jobRepository.save(updatedJob);
        }

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
      // Check if it is a terminal error (either Provider validation/auth or DownloadedAssetValidationError)
      const isTerminalProviderError =
        error instanceof ProviderError &&
        (error.category === ProviderErrorCategory.VALIDATION_ERROR ||
          error.category === ProviderErrorCategory.AUTH_ERROR);

      const isTerminalDownloadError = error instanceof DownloadedAssetValidationError;

      if (isTerminalProviderError || isTerminalDownloadError) {
        const now = new Date();

        const failedJob: GenerationJob = {
          ...job,
          status: JobStatus.FAILED,
          lastError: (error as Error).message,
          updatedAt: now,
        };

        await this.jobRepository.save(failedJob);
      }

      // Re-throw all errors (transient or terminal)
      throw error;
    }
  }
}

