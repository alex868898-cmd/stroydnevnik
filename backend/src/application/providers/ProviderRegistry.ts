import { ProviderAdapter } from '../../domain/providers/ProviderAdapter.js';
import { UseCase } from '../../domain/jobs/GenerationRequest.js';

export class DuplicateProviderError extends Error {
  constructor(providerId: string) {
    super(`Provider with ID '${providerId}' is already registered.`);
    this.name = 'DuplicateProviderError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DuplicateProviderError);
    }
  }
}

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new DuplicateProviderError(adapter.id);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getForUseCase(useCase: UseCase): ProviderAdapter[] {
    return Array.from(this.adapters.values()).filter((adapter) =>
      adapter.capabilities().supportedUseCases.includes(useCase)
    );
  }
}
