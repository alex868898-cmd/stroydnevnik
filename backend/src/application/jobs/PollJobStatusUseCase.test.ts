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
  PollJobStatusUseCase, 
  JobNotFoundError, 
  InvalidJobStatusError, 
  MissingProviderJobIdError,
  SucceededStateDeferredError,
  ProviderNotFoundError
} from './PollJobStatusUseCase.js';

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
    private readonly pollMock: (providerJobId: string) => Promise<NormalizedProviderStatus>
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
      supportsProgressReporting: true
    };
  }

  async submit(request: any): Promise<{ providerJobId: string }> {
    return { providerJobId: 'provider-job-abc' };
  }

  async poll(providerJobId: string): Promise<NormalizedProviderStatus> {
    return this.pollMock(providerJobId);
  }

  async cancel(providerJobId: string): Promise<CancelResult> {
    return 'success';
  }
}

// --- Test Suite ---

describe('PollJobStatusUseCase', () => {
  const mockRequest = {
    useCase: 'text-to-video' as const,
    prompt: 'A futuristic city',
    providerId: 'mock-provider'
  };

  const createJobInStatus = (id: string, status: JobStatus, providerJobId?: string): GenerationJob => ({
    id,
    request: mockRequest,
    status,
    providerId: 'mock-provider',
    providerJobId: providerJobId ?? (status !== JobStatus.QUEUED ? 'provider-job-123' : undefined),
    attempts: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  it('should transition job from SUBMITTED to PROCESSING and update progress', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { status: 'processing', progress: 0.45 };
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.SUBMITTED);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    const result = await useCase.execute('job-1');

    assert.strictEqual(result.status, JobStatus.PROCESSING);
    assert.strictEqual(result.progress, 0.45);
    
    // Assert DB persistence
    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.PROCESSING);
    assert.strictEqual(persisted.progress, 0.45);
  });

  it('should transition job from PROCESSING to PROCESSING with new progress', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { status: 'processing', progress: 0.90 };
    });
    providerRegistry.register(fakeAdapter);

    const job = {
      ...createJobInStatus('job-1', JobStatus.PROCESSING),
      progress: 0.45
    };
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    const result = await useCase.execute('job-1');

    assert.strictEqual(result.status, JobStatus.PROCESSING);
    assert.strictEqual(result.progress, 0.90);
  });

  it('should transition job to FAILED when provider reports failure', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { status: 'failed', errorDetail: 'Inference error' };
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.PROCESSING);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    const result = await useCase.execute('job-1');

    assert.strictEqual(result.status, JobStatus.FAILED);
    assert.strictEqual(result.lastError, 'Inference error');

    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.FAILED);
    assert.strictEqual(persisted.lastError, 'Inference error');
  });

  it('should transition job to CANCELLED when provider reports cancellation', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { status: 'cancelled' };
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.PROCESSING);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    const result = await useCase.execute('job-1');

    assert.strictEqual(result.status, JobStatus.CANCELLED);

    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.CANCELLED);
  });

  it('should throw SucceededStateDeferredError and NOT mutate database state if provider reports SUCCEEDED', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      return { status: 'succeeded', assetUrl: 'http://example.com/video.mp4' };
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.PROCESSING);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);

    // Verify SucceededStateDeferredError is thrown
    await assert.rejects(
      useCase.execute('job-1'),
      SucceededStateDeferredError
    );

    // Verify state in DB remains unchanged (still PROCESSING, not SUCCEEDED)
    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.PROCESSING);
  });

  it('should throw JobNotFoundError when job is not found', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);

    await assert.rejects(
      useCase.execute('non-existent-id'),
      JobNotFoundError
    );
  });

  it('should throw InvalidJobStatusError when job is in QUEUED state', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const job = createJobInStatus('job-1', JobStatus.QUEUED);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      InvalidJobStatusError
    );
  });

  it('should throw InvalidJobStatusError when job is already in a terminal state (e.g. SUCCEEDED)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const job = createJobInStatus('job-1', JobStatus.SUCCEEDED);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      InvalidJobStatusError
    );
  });

  it('should throw MissingProviderJobIdError when providerJobId is missing', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const job = createJobInStatus('job-1', JobStatus.SUBMITTED, undefined);
    delete job.providerJobId; // Force empty
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      MissingProviderJobIdError
    );
  });

  it('should throw ProviderNotFoundError when provider is not registered', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry(); // Empty registry
    
    const job = createJobInStatus('job-1', JobStatus.SUBMITTED);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);
    await assert.rejects(
      useCase.execute('job-1'),
      ProviderNotFoundError
    );
  });

  it('should transition job to FAILED and rethrow error on terminal provider errors (e.g. ValidationError)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new ProviderError(ProviderErrorCategory.VALIDATION_ERROR, 'Job expired or deleted on provider');
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.PROCESSING);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);

    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err instanceof ProviderError && err.category === ProviderErrorCategory.VALIDATION_ERROR
    );

    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.FAILED);
    assert.strictEqual(persisted.lastError, 'Job expired or deleted on provider');
  });

  it('should NOT update job state and should rethrow error on transient provider errors (e.g. TransientError)', async () => {
    const jobRepo = new FakeJobRepository();
    const providerRegistry = new ProviderRegistry();
    
    const fakeAdapter = new FakeProviderAdapter('mock-provider', async () => {
      throw new ProviderError(ProviderErrorCategory.TRANSIENT_ERROR, 'Network error');
    });
    providerRegistry.register(fakeAdapter);

    const job = createJobInStatus('job-1', JobStatus.PROCESSING);
    await jobRepo.save(job);

    const useCase = new PollJobStatusUseCase(jobRepo, providerRegistry);

    await assert.rejects(
      useCase.execute('job-1'),
      (err: any) => err instanceof ProviderError && err.category === ProviderErrorCategory.TRANSIENT_ERROR
    );

    const persisted = await jobRepo.findById('job-1');
    assert.ok(persisted);
    assert.strictEqual(persisted.status, JobStatus.PROCESSING);
  });
});
