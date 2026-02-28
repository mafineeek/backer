import { Transform, TransformCallback } from 'stream';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Creates an AES-256-CBC encryption transform stream.
 * Pre-pends the randomly generated IV to the stream so
 * the file can be decrypted later without storing the IV.
 */
export function createEncryptionStream(): Transform {
    if (!env.ENABLE_ENCRYPTION || !env.BACKUP_ENCRYPTION_KEY) {
        logger.info('Encryption is disabled, bypassing encryption layer');
        // Return a simple passthrough stream if disabled
        return new Transform({
            transform(chunk, encoding, callback) {
                callback(null, chunk);
            }
        });
    }

    logger.info('Encryption is enabled, generating AES-256-CBC cipher');

    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    // Ensure the key length is valid
    const keyBuffer = Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'utf-8');

    // Verify key size
    if (keyBuffer.length !== 32) {
        throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes for aes-256-cbc');
    }

    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);

    let ivAppended = false;

    return new Transform({
        transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
            if (!ivAppended) {
                // Appending IV (16 bytes) at the very beginning of the stream
                this.push(iv);
                ivAppended = true;
            }

            // Encrypt and push chunk
            const encryptedChunk = cipher.update(chunk);
            if (encryptedChunk.length > 0) {
                this.push(encryptedChunk);
            }
            callback();
        },

        flush(callback: TransformCallback) {
            try {
                const finalChunk = cipher.final();
                if (finalChunk.length > 0) {
                    this.push(finalChunk);
                }
                callback();
            } catch (err: any) {
                callback(err);
            }
        }
    });
}
