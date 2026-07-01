import { Readable } from 'stream';

export interface DownloadedAsset {
  data: Readable;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

export class DownloadedAssetValidationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'DownloadedAssetValidationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DownloadedAssetValidationError);
    }
  }
}

export interface AssetDownloader {
  /**
   * Downloads an asset from a URL and verifies it.
   * Performs byte-level validation of the file signature to confirm content type.
   * 
   * @param url The external URL of the asset.
   * @returns The validated download details.
   * @throws {DownloadedAssetValidationError} If the file fails size or byte-level type validation.
   * @throws {Error} If the HTTP download fails with transient or server errors.
   */
  download(url: string): Promise<DownloadedAsset>;
}
