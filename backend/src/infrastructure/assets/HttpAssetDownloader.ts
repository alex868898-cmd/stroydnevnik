import { Readable, PassThrough } from 'stream';
import * as path from 'path';
import { AssetDownloader, DownloadedAsset, DownloadedAssetValidationError } from '../../domain/assets/AssetDownloader.js';

export class HttpAssetDownloader implements AssetDownloader {
  private readonly maxSizeBytes: number;

  constructor(maxSizeBytes: number = 100 * 1024 * 1024) { // Default 100MB
    this.maxSizeBytes = maxSizeBytes;
  }

  async download(url: string): Promise<DownloadedAsset> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const message = `Failed to download asset from provider. HTTP status: ${response.status} ${response.statusText}`;
        // 400 and 404 are terminal validation errors (link broken or bad request)
        if (response.status === 400 || response.status === 404) {
          throw new DownloadedAssetValidationError(message);
        }
        // Others (5xx, etc.) are treated as standard transient errors
        throw new Error(message);
      }

      if (!response.body) {
        throw new DownloadedAssetValidationError('Response body is empty');
      }

      // Read Content-Length and validate size
      const contentLengthHeader = response.headers.get('content-length');
      const sizeBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      
      if (isNaN(sizeBytes) || sizeBytes <= 0) {
        throw new DownloadedAssetValidationError('Invalid or missing content-length header from provider.');
      }

      if (sizeBytes > this.maxSizeBytes) {
        throw new DownloadedAssetValidationError(
          `File size (${sizeBytes} bytes) exceeds the maximum allowed limit of ${this.maxSizeBytes} bytes.`
        );
      }

      // Read Content-Type (declared mime type)
      const declaredMimeType = response.headers.get('content-type') || 'application/octet-stream';

      // Extract filename from headers or URL
      const filename = this.extractFilename(response.headers, url);

      // Convert Web ReadableStream to Node Readable stream
      const nodeStream = Readable.fromWeb(response.body as any);

      // Peek the first 12 bytes of the stream for signature verification
      const { peeked, collected } = await this.readFirstChunk(nodeStream, 12);
      
      if (!peeked || peeked.length < 8) {
        throw new DownloadedAssetValidationError('Failed to read sufficient bytes to verify file signature.');
      }

      // Detect mime type from actual bytes
      const detectedMimeType = this.detectMimeType(peeked);
      if (!detectedMimeType) {
        throw new DownloadedAssetValidationError('Failed to identify supported video signature in downloaded file bytes.');
      }

      // Validate byte signature against declared headers (if specific)
      const cleanDeclaredMime = declaredMimeType.split(';')[0].trim().toLowerCase();
      if (cleanDeclaredMime !== 'application/octet-stream' && cleanDeclaredMime !== detectedMimeType) {
        throw new DownloadedAssetValidationError(
          `Mime type mismatch: declared header '${declaredMimeType}', but actual file bytes indicate '${detectedMimeType}'.`
        );
      }

      // Reconstruct the full stream by writing the collected buffer
      const reconstructedStream = new PassThrough();
      reconstructedStream.write(collected);
      nodeStream.pipe(reconstructedStream);
      
      // Propagate stream errors from the source stream
      nodeStream.on('error', (err) => reconstructedStream.emit('error', err));

      return {
        data: reconstructedStream,
        mimeType: detectedMimeType,
        sizeBytes,
        filename,
      };
    } catch (error) {
      // Avoid wrapping already classified validation errors
      if (error instanceof DownloadedAssetValidationError) {
        throw error;
      }
      // Network failures, connection timeouts, or socket resets propagate as-is (transient)
      throw error;
    }
  }

  private extractFilename(headers: Headers, url: string): string {
    const contentDisposition = headers.get('content-disposition');
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        return match[1];
      }
    }

    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const basenameSegment = path.basename(pathname);
      if (basenameSegment && basenameSegment.trim() !== '') {
        return basenameSegment;
      }
    } catch {
      // Ignore URL parsing errors
    }

    return 'video.mp4'; // Default fallback
  }

  private detectMimeType(chunk: Buffer): string | null {
    if (chunk.length < 4) return null;

    // WebM: EBML header [1A 45 DF A3]
    if (chunk[0] === 0x1A && chunk[1] === 0x45 && chunk[2] === 0xDF && chunk[3] === 0xA3) {
      return 'video/webm';
    }

    // Ogg: [4F 67 67 53] (OggS)
    if (chunk[0] === 0x4F && chunk[1] === 0x67 && chunk[2] === 0x67 && chunk[3] === 0x53) {
      return 'video/ogg';
    }

    // MP4: 'ftyp' box signature at bytes 4 to 7
    if (chunk.length >= 8 &&
        chunk[4] === 0x66 && chunk[5] === 0x74 && chunk[6] === 0x79 && chunk[7] === 0x70) {
      return 'video/mp4';
    }

    return null;
  }

  private async readFirstChunk(stream: Readable, length: number): Promise<{ peeked: Buffer; collected: Buffer }> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const chunks: Buffer[] = [];
      let totalLength = 0;

      const onData = (chunk: any) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buf);
        totalLength += buf.length;
        
        if (totalLength >= length) {
          cleanup();
          const collected = Buffer.concat(chunks);
          resolve({
            peeked: collected.subarray(0, length),
            collected,
          });
        }
      };

      const onEnd = () => {
        cleanup();
        const collected = Buffer.concat(chunks);
        resolve({
          peeked: collected,
          collected,
        });
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        stream.off('data', onData);
        stream.off('end', onEnd);
        stream.off('error', onError);
      };

      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('error', onError);
    });
  }
}
