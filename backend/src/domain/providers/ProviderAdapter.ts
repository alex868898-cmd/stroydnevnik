import { GenerationRequest } from '../jobs/GenerationRequest.js';
import { ProviderCapabilityContract } from './ProviderCapabilityContract.js';

export interface NormalizedProviderStatus {
  status: 'processing' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number | null;
  assetUrl?: string | null;
  errorDetail?: string | null;
}

export type CancelResult = 'success' | 'unsupported' | 'failed';

export interface ProviderAdapter {
  readonly id: string;
  capabilities(): ProviderCapabilityContract;
  submit(request: GenerationRequest): Promise<{ providerJobId: string }>;
  poll(providerJobId: string): Promise<NormalizedProviderStatus>;
  cancel(providerJobId: string): Promise<CancelResult>;
}

