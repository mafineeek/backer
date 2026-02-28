import { z } from 'zod';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const envSchema = z.object({
    // Required DB Connection
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().min(1, 'DB_USER is required'),
    DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
    DB_NAME: z.string().min(1, 'DB_NAME is required'),

    // Required Cloudflare R2 Config
    R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
    R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
    R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
    R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
    R2_UPLOAD_PATH: z.string().default('mysql/{YYYY}/{MM}/{dbname}-{timestamp}.sql.gz.enc'),

    // Encryption Config
    ENABLE_ENCRYPTION: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
    BACKUP_ENCRYPTION_KEY: z.string().optional()
}).superRefine((data, ctx) => {
    if (data.ENABLE_ENCRYPTION && (!data.BACKUP_ENCRYPTION_KEY || data.BACKUP_ENCRYPTION_KEY.length !== 32)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'BACKUP_ENCRYPTION_KEY must be exactly 32 characters when ENABLE_ENCRYPTION is true',
            path: ['BACKUP_ENCRYPTION_KEY']
        });
    }
});

let parsedEnv: z.infer<typeof envSchema>;

try {
    parsedEnv = envSchema.parse(process.env);
} catch (error) {
    if (error instanceof z.ZodError) {
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: 'Environment validation failed',
            context: { errors: error.errors }
        }));
        process.exit(1);
    }
    throw error;
}

export const env = parsedEnv;
