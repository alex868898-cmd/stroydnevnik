import { ProviderAdapter, NormalizedProviderStatus, CancelResult } from '../../../domain/providers/ProviderAdapter.js';
import { GenerationRequest } from '../../../domain/jobs/GenerationRequest.js';
import { ProviderCapabilityContract } from '../../../domain/providers/ProviderCapabilityContract.js';

export class MockProviderAdapter implements ProviderAdapter {
  readonly id = 'mock';
  private jobs = new Map<string, number>();

  capabilities(): ProviderCapabilityContract {
    return {
      providerId: 'mock',
      displayName: 'Mock Provider',
      supportedUseCases: ['text-to-video'],
      paramSchema: {
        duration: { min: 1, max: 10, step: 1 },
        aspectRatios: ['16:9', '9:16', '1:1'],
        supportsSeed: true
      },
      supportsCancel: true,
      supportsProgressReporting: false
    };
  }

  async submit(request: GenerationRequest): Promise<{ providerJobId: string }> {
    const providerJobId = `mock-job-${Math.random().toString(36).substring(2, 9)}`;
    this.jobs.set(providerJobId, Date.now());
    return { providerJobId };
  }

  async poll(providerJobId: string): Promise<NormalizedProviderStatus> {
    const createdAt = this.jobs.get(providerJobId);
    if (!createdAt) {
      return { status: 'failed', errorDetail: 'Job not found' };
    }

    // Simulate 5 seconds processing delay
    if (Date.now() - createdAt < 5000) {
      return { status: 'processing', progress: 0 };
    }

    return { status: 'succeeded', assetUrl: 'http://example.com/mock-video.mp4' };
  }

  async cancel(providerJobId: string): Promise<CancelResult> {
    if (this.jobs.has(providerJobId)) {
      this.jobs.delete(providerJobId);
      return 'success';
    }
    return 'failed';
  }
}
