import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { db } from './db/connection';
import { DumpGenerator } from './dump/generator';
import { createEncryptionStream } from './services/encryption';
import { UploadService } from './services/upload';
import { logger } from './utils/logger';

async function main() {
    logger.info('Starting external database backup pipeline');

    try {
        // 1. Establish database connection
        await db.testConnection();
        const tables = await db.getTables();
        logger.info('Database tables retrieved', { count: tables.length });

        if (tables.length === 0) {
            logger.warn('No tables found to backup, exiting.');
            await db.close();
            process.exit(0);
        }

        // 2. Setup the dump stream
        const dumpStream = new DumpGenerator(db, tables, { batchSize: 1000 });
        logger.info('Dump stream generation started');

        // 3. Setup zip compression
        const gzipStream = zlib.createGzip();
        logger.info('Compression stream initialized');

        // 4. Setup encryption
        const encryptionStream = createEncryptionStream();

        // 5. Setup upload service
        const uploadService = new UploadService();

        // 6. Connect streams using pipeline to handle backpressure and propagation
        // Instead of processing async iterable directly, wrap it or use passThrough
        // Actually lib-storage Upload accepts Readable | ReadableStream | Blob | string | Uint8Array | Buffer
        // And stream pipeline returns the final stream (which is a Transform stream here).
        // Let's use the standard Readable approach since createEncryptionStream returns Transform (a subclass of Readable).
        const finalStream = encryptionStream;

        // Connect them physically 
        dumpStream.pipe(gzipStream).pipe(finalStream);

        // Upload reads from the final stream
        await uploadService.uploadStream(finalStream);

        logger.info('Backup pipeline completed successfully');

    } catch (error: any) {
        logger.error('CRITICAL: Backup pipeline failed', { error: error.message, stack: error.stack });
        process.exit(1);

    } finally {
        // 7. Cleanup DB gracefully
        await db.close();
    }
}

// Ensure unhandled rejections are caught
process.on('unhandledRejection', (reason: any) => {
    logger.error('Unhandled Rejection', { reason: reason?.message || reason });
    process.exit(1);
});

// Run
main();
