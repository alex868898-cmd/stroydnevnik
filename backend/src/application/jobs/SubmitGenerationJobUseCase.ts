import { randomUUID } from 'crypto';
import { GenerationJob } from '../../domain/jobs/GenerationJob.js';
import { GenerationRequest } from '../../domain/jobs/GenerationRequest.js';
import { JobRepository } from '../../domain/jobs/JobRepository.js';
import { JobStatus } from '../../domain/jobs/JobStatus.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';

export class ProviderNotFoundError extends Error {
  constructor(providerId: string) {
    super(`Provider with ID '${providerId}' not found.`);
    this.name = 'ProviderNotFoundError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderNotFoundError);
    }
  }
}

export class SubmitGenerationRequestValidationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'SubmitGenerationRequestValidationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SubmitGenerationRequestValidationError);
    }
  }
}

export class SubmitGenerationJobUseCase {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly providerRegistry: ProviderRegistry
  ) {}

  /**
   * Validates and submits a new generation request, persisting it in the database.
   * 
   * @param request The generation request details.
   * @returns The created job in 'queued' status.
   * @throws {ProviderNotFoundError} If the requested provider is not registered.
   * @throws {SubmitGenerationRequestValidationError} If the request fails validation rules.
   */
  async execute(request: GenerationRequest): Promise<GenerationJob> {
    // 1. Prompt check: must exist and not be empty after trim()
    if (!request.prompt || typeof request.prompt !== 'string' || request.prompt.trim() === '') {
      throw new SubmitGenerationRequestValidationError('Prompt must be a non-empty string.', 'prompt');
    }

    // 2. Provider existence check
    const provider = this.providerRegistry.get(request.providerId);
    if (!provider) {
      throw new ProviderNotFoundError(request.providerId);
    }

    const capabilities = provider.capabilities();

    // 3. Use Case check
    if (!capabilities.supportedUseCases.includes(request.useCase)) {
      throw new SubmitGenerationRequestValidationError(
        `Provider '${request.providerId}' does not support use case '${request.useCase}'.`,
        'useCase'
      );
    }

    // 4. Parameter checks strictly from capability contract (if params are provided)
    if (request.params) {
      const { duration, aspectRatio, seed } = request.params;
      const { paramSchema } = capabilities;

      // Duration range check
      if (duration !== undefined) {
        if (typeof duration !== 'number' || isNaN(duration)) {
          throw new SubmitGenerationRequestValidationError('Duration must be a number.', 'params.duration');
        }
        if (duration < paramSchema.duration.min || duration > paramSchema.duration.max) {
          throw new SubmitGenerationRequestValidationError(
            `Duration ${duration} is out of range. Allowed range is ${paramSchema.duration.min} to ${paramSchema.duration.max}.`,
            'params.duration'
          );
        }
      }

      // Aspect Ratio allowed check
      if (aspectRatio !== undefined) {
        if (!paramSchema.aspectRatios.includes(aspectRatio)) {
          throw new SubmitGenerationRequestValidationError(
            `Aspect ratio '${aspectRatio}' is not supported. Supported ratios: ${paramSchema.aspectRatios.join(', ')}.`,
            'params.aspectRatio'
          );
        }
      }

      // Seed support check
      if (seed !== undefined) {
        if (!paramSchema.supportsSeed) {
          throw new SubmitGenerationRequestValidationError(
            `Seed is not supported by provider '${request.providerId}'.`,
            'params.seed'
          );
        }
        if (typeof seed !== 'number' || isNaN(seed)) {
          throw new SubmitGenerationRequestValidationError('Seed must be a number.', 'params.seed');
        }
      }
    }

    const now = new Date();
    
    // Create GenerationJob strictly in domain shape with optional fields omitted (undefined)
    const job: GenerationJob = {
      id: randomUUID(),
      request,
      status: JobStatus.QUEUED,
      providerId: request.providerId,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    return await this.jobRepository.save(job);
  }
}
