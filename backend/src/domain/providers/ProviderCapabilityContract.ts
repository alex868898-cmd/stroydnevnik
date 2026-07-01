import { UseCase } from '../jobs/GenerationRequest.js';

export interface ParamRange {
  min: number;
  max: number;
  step?: number;
}

export interface ProviderCapabilityContract {
  providerId: string;
  displayName: string;
  supportedUseCases: UseCase[];
  paramSchema: {
    duration: ParamRange;
    aspectRatios: string[];
    supportsSeed: boolean;
  };
  supportsCancel: boolean;
  supportsProgressReporting: boolean;
}
