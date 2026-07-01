import { ProviderAdapter } from '../../../domain/providers/ProviderAdapter.js';

export class MockProviderAdapter implements ProviderAdapter {
  readonly id = 'mock';
  private jobs = new Map<string, number>();

  async submit(prompt: string): Promise<{ providerJobId: string }> {
    const providerJobId = `mock-job-${Math.random().toString(36).substring(2, 9)}`;
    this.jobs.set(providerJobId, Date.now());
    return { providerJobId };
  }

  async poll(providerJobId: string): Promise<{ status: string }> {
    const createdAt = this.jobs.get(providerJobId);
    if (!createdAt) {
      return { status: 'failed' };
    }

    // Simulate 5 seconds processing delay
    if (Date.now() - createdAt < 5000) {
      return { status: 'processing' };
    }

    return { status: 'succeeded' };
  }
}
