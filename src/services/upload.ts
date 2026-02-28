import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class UploadService {
    private client: S3Client;

    constructor() {
        this.client = new S3Client({
            region: 'auto',
            endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: env.R2_ACCESS_KEY_ID,
                secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            },
            // Max 3 retries as requested
            maxAttempts: 4,
        });
    }

    private generateUploadKey(): string {
        const now = new Date();
        const year = now.getUTCFullYear().toString();
        const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
        const timestamp = now.toISOString().replace(/[:.]/g, '-');

        let key = env.R2_UPLOAD_PATH
            .replace('{YYYY}', year)
            .replace('{MM}', month)
            .replace('{dbname}', env.DB_NAME)
            .replace('{timestamp}', timestamp);

        // If encryption is disabled and the path ends with .enc, remove it dynamically
        if (!env.ENABLE_ENCRYPTION && key.endsWith('.enc')) {
            key = key.slice(0, -4);
        }
        return key;
    }

    public async uploadStream(stream: Readable): Promise<string> {
        const key = this.generateUploadKey();

        logger.info('Starting remote R2 upload', { bucket: env.R2_BUCKET_NAME, key });

        try {
            const uploader = new Upload({
                client: this.client,
                params: {
                    Bucket: env.R2_BUCKET_NAME,
                    Key: key,
                    Body: stream,
                },
            });

            uploader.on('httpUploadProgress', (progress) => {
                logger.info('Upload chunk transferred', {
                    key,
                    loadedBytes: progress.loaded,
                    totalBytes: progress.total,
                });
            });

            await uploader.done();
            logger.info('Upload fully completed', { bucket: env.R2_BUCKET_NAME, key });
            return key;
        } catch (error: any) {
            logger.error('R2 upload failed', {
                key,
                bucket: env.R2_BUCKET_NAME,
                error: error.message,
            });
            throw error;
        }
    }
}
