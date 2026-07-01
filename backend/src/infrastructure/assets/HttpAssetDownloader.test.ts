import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import { HttpAssetDownloader } from './HttpAssetDownloader.js';
import { DownloadedAssetValidationError } from '../../domain/assets/AssetDownloader.js';
import { AssetPathPolicy } from '../../domain/assets/AssetPathPolicy.js';

// --- Helper to convert a Buffer to a Web ReadableStream ---
function bufferToWebStream(buf: Buffer): any {
  const nodeStream = Readable.from(buf);
  return Readable.toWeb(nodeStream);
}

// --- Fetch Mocking Helpers ---
const originalFetch = globalThis.fetch;

function mockFetchResponse(status: number, headers: Record<string, string>, bodyBuffer: Buffer) {
  globalThis.fetch = async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers(headers),
      body: bufferToWebStream(bodyBuffer)
    } as any;
  };
}

function mockFetchError(error: Error) {
  globalThis.fetch = async () => {
    throw error;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// --- Test Suite ---

describe('AssetPathPolicy', () => {
  it('should generate a correct relative path for generated assets', () => {
    const path = AssetPathPolicy.getGeneratedAssetPath('job-123', 'output.mp4');
    assert.strictEqual(path, 'generated/job-123/output.mp4');
  });

  it('should sanitize filename to prevent directory traversal', () => {
    const path = AssetPathPolicy.getGeneratedAssetPath('job-123', '../../etc/passwd');
    assert.strictEqual(path, 'generated/job-123/passwd');
  });

  it('should throw error when jobId or filename is empty', () => {
    assert.throws(() => AssetPathPolicy.getGeneratedAssetPath('', 'file.mp4'));
    assert.throws(() => AssetPathPolicy.getGeneratedAssetPath('job-1', ' '));
  });
});

describe('HttpAssetDownloader', () => {
  after(() => {
    restoreFetch();
  });

  it('should successfully download and validate an MP4 file by checking its magic bytes', async () => {
    // MP4 header: ftyp starts at byte 4
    const mp4Bytes = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 109, 112, 52, 50, 1, 2, 3, 4]); // 16 bytes
    mockFetchResponse(200, {
      'content-length': '16',
      'content-type': 'video/mp4',
      'content-disposition': 'attachment; filename="my-video.mp4"'
    }, mp4Bytes);

    const downloader = new HttpAssetDownloader();
    const result = await downloader.download('http://example.com/asset.mp4');

    assert.strictEqual(result.mimeType, 'video/mp4');
    assert.strictEqual(result.sizeBytes, 16);
    assert.strictEqual(result.filename, 'my-video.mp4');

    // Test stream reconstruction: read all data from the returned stream
    const chunks: Buffer[] = [];
    for await (const chunk of result.data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fullStreamContent = Buffer.concat(chunks);
    
    // Assert entire stream is uncorrupted and matches the original response body
    assert.deepStrictEqual(fullStreamContent, mp4Bytes);
  });

  it('should successfully download and validate a WebM file by checking its magic bytes', async () => {
    // WebM EBML header: 1A 45 DF A3
    const webmBytes = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3, 4, 5, 6, 7, 8]); // 12 bytes
    mockFetchResponse(200, {
      'content-length': '12',
      'content-type': 'video/webm'
    }, webmBytes);

    const downloader = new HttpAssetDownloader();
    const result = await downloader.download('http://example.com/asset.webm');

    assert.strictEqual(result.mimeType, 'video/webm');
    assert.strictEqual(result.sizeBytes, 12);
    assert.strictEqual(result.filename, 'asset.webm'); // Extracted from URL fallback

    const chunks: Buffer[] = [];
    for await (const chunk of result.data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    assert.deepStrictEqual(Buffer.concat(chunks), webmBytes);
  });

  it('should throw DownloadedAssetValidationError on size mismatch/exceeded limits', async () => {
    const data = Buffer.alloc(100);
    mockFetchResponse(200, {
      'content-length': '500', // Declared 500 bytes but we only allow 10 bytes max in this specific downloader instance
    }, data);

    const downloader = new HttpAssetDownloader(10); // Max size = 10 bytes
    await assert.rejects(
      downloader.download('http://example.com/asset.mp4'),
      DownloadedAssetValidationError
    );
  });

  it('should throw DownloadedAssetValidationError when file contents do not match declared video format (Mismatch check)', async () => {
    // Declaring video/mp4 but writing plain text bytes ("hello world")
    const textBytes = Buffer.from('hello world plain text');
    mockFetchResponse(200, {
      'content-length': String(textBytes.length),
      'content-type': 'video/mp4'
    }, textBytes);

    const downloader = new HttpAssetDownloader();
    await assert.rejects(
      downloader.download('http://example.com/asset.mp4'),
      (err: any) => err instanceof DownloadedAssetValidationError && err.message.includes('signature')
    );
  });

  it('should throw DownloadedAssetValidationError on mismatched specific mime type headers', async () => {
    // WebM bytes but declared header is video/mp4
    const webmBytes = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3, 4, 5, 6, 7, 8]);
    mockFetchResponse(200, {
      'content-length': '12',
      'content-type': 'video/mp4' // Mismatched header
    }, webmBytes);

    const downloader = new HttpAssetDownloader();
    await assert.rejects(
      downloader.download('http://example.com/asset.mp4'),
      (err: any) => err instanceof DownloadedAssetValidationError && err.message.includes('mismatch')
    );
  });

  it('should throw DownloadedAssetValidationError on terminal HTTP errors (404)', async () => {
    mockFetchResponse(404, {}, Buffer.alloc(0));

    const downloader = new HttpAssetDownloader();
    await assert.rejects(
      downloader.download('http://example.com/asset.mp4'),
      DownloadedAssetValidationError
    );
  });

  it('should propagate standard transient network errors without wrapping them', async () => {
    const networkError = new Error('getaddrinfo ENOTFOUND cdn.provider.com');
    mockFetchError(networkError);

    const downloader = new HttpAssetDownloader();
    await assert.rejects(
      downloader.download('http://example.com/asset.mp4'),
      (err: any) => !(err instanceof DownloadedAssetValidationError) && err.message.includes('ENOTFOUND')
    );
  });
});
