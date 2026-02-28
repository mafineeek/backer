import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class Database {
    private pool: mysql.Pool;

    constructor() {
        this.pool = mysql.createPool({
            host: env.DB_HOST,
            port: env.DB_PORT,
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,

            supportBigNumbers: true,
            bigNumberStrings: true,
            dateStrings: true,

            timezone: 'Z',
        });
    }

    public getPool(): mysql.Pool {
        return this.pool;
    }

    public async testConnection(): Promise<void> {
        try {
            const connection = await this.pool.getConnection();
            connection.release();
            logger.info('Database connection established', { host: env.DB_HOST, database: env.DB_NAME });
        } catch (error: any) {
            logger.error('Failed to connect to database', { error: error.message, host: env.DB_HOST });
            throw error;
        }
    }

    public async getTables(): Promise<string[]> {
        const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
            `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
            [env.DB_NAME]
        );
        return rows.map((row) => row.TABLE_NAME);
    }

    public async close(): Promise<void> {
        await this.pool.end();
        logger.info('Database connection pool closed');
    }
}

export const db = new Database();
