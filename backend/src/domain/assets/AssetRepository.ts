import { AssetReference } from './AssetReference.js';

export interface AssetRepository {
  findById(id: string): Promise<AssetReference | null>;
  save(asset: AssetReference): Promise<AssetReference>;
  delete(id: string): Promise<void>;
  list(): Promise<AssetReference[]>;
  findByJobId(jobId: string): Promise<AssetReference | null>;
}
