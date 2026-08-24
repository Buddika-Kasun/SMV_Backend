import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './env';

/**
 * S3-compatible object storage (Cloudflare R2 / MinIO / AWS S3).
 *
 * The API never proxies file bytes - it issues short-lived presigned URLs:
 *   - presignUpload() -> PUT URL the frontend uploads the file to
 *   - presignGet()    -> GET URL the frontend downloads/previews the object with
 *
 * The object key is the only thing persisted into PostgreSQL; the bucket name
 * and credentials stay server-side.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly configured: boolean;

  constructor() {
    const { bucketName, accessKeyId, secretAccessKey, endpoint, region } = config.storage;
    this.configured = Boolean(bucketName && accessKeyId && secretAccessKey && endpoint);

    this.bucket = bucketName;

    if (this.configured) {
      this.client = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log(`Storage configured for bucket "${bucketName}" @ ${endpoint}`);
    } else {
      // Dummy client - calls throw a clear error when storage is misconfigured.
      this.client = new S3Client({ region });
      this.logger.warn(
        'Object storage NOT configured (STORAGE_* env vars missing). Upload endpoints will fail with a clear error.',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /** Build a namespaced object key from a business prefix and original file name. */
  buildKey(prefix: string, fileName: string): string {
    const stamp = Date.now();
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';
    return `${prefix}/${stamp}-${safe}`;
  }

  /** Short-lived URL for uploading an object (expires default 15 min). */
  async presignPut(key: string, contentType = 'application/octet-stream', expiresIn?: number): Promise<string> {
    this.assertConfigured();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? config.storage.presignDurationSeconds,
    });
  }

  /** Short-lived URL for reading an object (expires default 15 min). */
  async presignGet(key: string, expiresIn?: number): Promise<string> {
    this.assertConfigured();
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? config.storage.presignDurationSeconds,
    });
  }

  /** Whether an object already exists in the bucket. */
  async exists(key: string): Promise<boolean> {
    this.assertConfigured();
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /** Permanently remove an object. */
  async remove(key: string): Promise<void> {
    this.assertConfigured();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new Error(
        'Object storage is not configured. Set STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY and STORAGE_ENDPOINT.',
      );
    }
  }
}