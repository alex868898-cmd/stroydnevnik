import { basename } from 'path';

export class AssetPathPolicy {
  /**
   * Generates a safe, standardized relative storage path for generated assets.
   * Enforces filename sanitization using basename to prevent directory traversal.
   * 
   * @param jobId The unique ID of the generation job.
   * @param filename The suggested filename segment.
   * @returns The relative storage path (e.g. 'generated/{jobId}/{filename}').
   */
  static getGeneratedAssetPath(jobId: string, filename: string): string {
    if (!jobId || jobId.trim() === '') {
      throw new Error('jobId is required to generate asset path');
    }
    if (!filename || filename.trim() === '') {
      throw new Error('filename is required to generate asset path');
    }
    
    // Strip directories out of the filename to prevent path traversal
    const cleanFilename = basename(filename);
    
    return `generated/${jobId}/${cleanFilename}`;
  }
}
