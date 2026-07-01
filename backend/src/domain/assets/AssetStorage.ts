import { Readable } from 'stream';

export interface AssetStorage {
  /**
   * Saves the asset data (Buffer or stream) to the given destination path.
   * Returns the relative path to the saved asset.
   */
  save(path: string, data: Buffer | Readable): Promise<string>;
  
  /**
   * Deletes the asset file at the given destination path.
   */
  delete(path: string): Promise<void>;
  
  /**
   * Checks if an asset exists at the given destination path.
   */
  exists(path: string): Promise<boolean>;
}
