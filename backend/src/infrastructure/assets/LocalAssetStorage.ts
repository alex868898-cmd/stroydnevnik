import { AssetStorage } from '../../domain/assets/AssetStorage.js';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

export class LocalAssetStorage implements AssetStorage {
  private readonly absoluteStorageRoot: string;

  constructor(storageRoot: string) {
    this.absoluteStorageRoot = path.resolve(storageRoot);
  }

  /**
   * Resolves a relative path to an absolute path, verifying that it resides
   * strictly within the storageRoot directory to prevent path traversal attacks.
   */
  private resolvePath(relativePath: string): string {
    const absolutePath = path.resolve(this.absoluteStorageRoot, relativePath);
    const relative = path.relative(this.absoluteStorageRoot, absolutePath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal attempt detected: ${relativePath}`);
    }

    return absolutePath;
  }

  async save(relativePath: string, data: Buffer | Readable): Promise<string> {
    const absolutePath = this.resolvePath(relativePath);
    const directory = path.dirname(absolutePath);

    // Ensure the directory exists
    await fs.mkdir(directory, { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(absolutePath, data);
    } else {
      const writeStream = createWriteStream(absolutePath);
      await pipeline(data, writeStream);
    }

    return relativePath;
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = this.resolvePath(relativePath);
    try {
      await fs.unlink(absolutePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const absolutePath = this.resolvePath(relativePath);
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
