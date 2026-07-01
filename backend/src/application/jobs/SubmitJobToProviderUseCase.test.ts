import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JobRepository } from '../../domain/jobs/JobRepository.js';
import { GenerationJob } from '../../domain/jobs/GenerationJob.js';
import { JobStatus } from '../../domain/jobs/JobStatus.js';
import { ProviderAdapter, NormalizedProviderStatus, CancelResult } from '../../domain/providers/ProviderAdapter.js';
import { ProviderCapabilityContract } from '../../domain/providers/ProviderCapabilityContract.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ProviderError, ProviderErrorCategory } from '../../domain/providers/ProviderError.js';
import { 
  SubmitJobToProviderUseCase, 
  JobNotFoundError, 
  InvalidJobStatusError, 
  ProviderNotFoundError 
} from './SubmitJobToProviderUseCase.js';

// --- Fakes ---

class FakeJobRepository implements JobRepository {
  public readonly jobs = new Map<string, GenerationJob>();

  async findById(id: string): Promise<GenerationJob | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async save(job: GenerationJob): Promise<GenerationJob> {
    const saved = { ...job };
    this.jobs.set(job.id, saved);
    return saved;
  }

  async list(filter?: { status?: JobStatus; providerId?: string }): Promise<GenerationJob[]> {
    let result = Array.from(this.jobs.values());
    if (filter?.status) {
      result = result.filter(j => j.status === filter.status);
    }
    if (filter?.providerId) {
      result = result.filter(j => j.providerId === filter.providerId);
    }
    return result;
  }

  async findNonTerminal(): Promise<GenerationJob[]> {
    return Array.from(this.jobs.values()).filter(
      j => j.status !== JobStatus.SUCCEEDED && j.status !== JobStatus.FAILED && j.status !== JobStatus.CANCELLED
    );
  }
}

class FakeProviderAdapter implements ProviderAdapter {
  constructor(
    readonly id: string,
    private readonly submitMock: (request: any) => Promise<{ providerJobId: string }>
  ) {}

  capabilities(): ProviderCapabilityContract {
    return {
      providerId: this.id,
      displayName: 'Fake Provider',
      supportedUseCases: ['text-to-video'],
      paramSchema: {
        duration: { min: 1, max: 10 },
        aspectRatios: ['16:9'],
        supportsSeed: true
      },
      supportsCancel: true,
      supportsProgressReporting: false
    };
  }

  async submit(request: any): Promise<{ providerJobId: string }> {
    return this.submitMock(request);
  }

  async poll(providerJobId: string): Promise<NormalizedProviderStatus> {
    return { status: 'succeeded' };
  }

  async cancel(providerJobId: string): Promise<CancelResult> {
    return 'success';
  }
}

// --- Test Suite ---

describe('SubmitJobToProviderUseCase', () => {
  const mockRequest = {
    useCase: 'text-to-video' as const,
    prompt: 'A beautiful sunset',
    providerId: 'mock-provider'
  };

  const createQueuedJob = (id: string): GenerationJob => ({
    id,
    request: mockRequest,
    status: JobStatus.QUEUED,
    providerId: 'mock-provider',
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  it('should successfully submit a queued job and change status to SUBMITTED', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { providerJobId: 'provider-job-abc' };
    });
    providerRegistry.register(fakeAdapter);

    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    const result = await useCase.execute('job-1');

    // Assert returned shape
    assert.strictEqual(result.status, JobStatus.SUBMITTED);
    assert.strictEqual(result.providerJobId, 'provider-job-abc');
    assert.strictEqual(result.attempts, 1);
    assert.ok(result.updatedAt > queuedJob.updatedAt);

    // Assert state persisted in repository
    const persistedJob = await jobRepo.findById('job-1');
    assert.ok(persistedJob);
    assert.strictEqual(persistedJob.status, JobStatus.SUBMITTED);
    assert.strictEqual(persistedJob.providerJobId, 'provider-job-abc');
    assert.strictEqual(persistedJob.attempts, 1);
  });

  it('should throw JobNotFoundError when job is not found', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);

    await assert.rejects(
      useCase.execute('non-existent-id'),
      JobNotFoundError
    );
  });

  it('should throw InvalidJobStatusError when job is not in QUEUED status', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const submittedJob = {
      ...createQueuedJob('job-1'),
      status: JobStatus.SUBMITTED
    };
    await jobRepo.save(submittedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      InvalidJobStatusError
    );
  });

  it('should throw ProviderNotFoundError when provider is not registered', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry(); // Empty registry
    
    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      ProviderNotFoundError
    );
  });

  it('should transition job to FAILED and rethrow error on terminal provider errors (e.g. ValidationError)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new ProviderError(ProviderErrorCategory.VALIDATION_ERROR, 'Invalid parameters');
    });
    providerRegistry.register(fakeAdapter);

    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    
    // Assert use case rethrows the error
    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err instanceof ProviderError && err.category === ProviderErrorCategory.VALIDATION_ERROR
    );

    // Assert state persisted as FAILED with lastError saved and attempts incremented
    const persistedJob = await jobRepo.findById('job-1');
    assert.ok(persistedJob);
    assert.strictEqual(persistedJob.status, JobStatus.FAILED);
    assert.strictEqual(persistedJob.lastError, 'Invalid parameters');
    assert.strictEqual(persistedJob.attempts, 1);
  });

  it('should transition job to FAILED and rethrow error on terminal provider errors (e.g. AuthError)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new ProviderError(ProviderErrorCategory.AUTH_ERROR, 'Invalid credentials');
    });
    providerRegistry.register(fakeAdapter);

    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    
    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err instanceof ProviderError && err.category === ProviderErrorCategory.AUTH_ERROR
    );

    const persistedJob = await jobRepo.findById('job-1');
    assert.ok(persistedJob);
    assert.strictEqual(persistedJob.status, JobStatus.FAILED);
    assert.strictEqual(persistedJob.lastError, 'Invalid credentials');
    assert.strictEqual(persistedJob.attempts, 1);
  });

  it('should NOT update job state and should rethrow error on transient provider errors (e.g. TransientError)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new ProviderError(ProviderErrorCategory.TRANSIENT_ERROR, 'Network timeout');
    });
    providerRegistry.register(fakeAdapter);

    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    
    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err instanceof ProviderError && err.category === ProviderErrorCategory.TRANSIENT_ERROR
    );

    // Assert state in repository remains QUEUED with no error details
    const persistedJob = await jobRepo.findById('job-1');
    assert.ok(persistedJob);
    assert.strictEqual(persistedJob.status, JobStatus.QUEUED);
    assert.strictEqual(persistedJob.attempts, 0); // attempts not incremented for transient failures on submission
    assert.strictEqual(persistedJob.lastError, undefined);
  });

  it('should NOT update job state and should rethrow error on unknown errors', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new Error('Some unexpected programming bug');
    });
    providerRegistry.register(fakeAdapter);

    const queuedJob = createQueuedJob('job-1');
    await jobRepo.save(queuedJob);

    const useCase = new SubmitJobToProviderUseCase(jobRepo, providerRegistry);
    
    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err.message === 'Some unexpected programming bug'
    );

    // Assert state in repository remains QUEUED with no error details
    const persistedJob = await jobRepo.findById('job-1');
    assert.ok(persistedJob);
    assert.strictEqual(persistedJob.status, JobStatus.QUEUED);
    assert.strictEqual(persistedJob.attempts, 0);
  });
});
