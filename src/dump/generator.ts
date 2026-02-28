import { Readable } from 'stream';
import mysql from 'mysql2/promise';
import { Database } from '../db/connection';
import { logger } from '../utils/logger';
import { escapeIdentifier, escapeSqlValue } from '../utils/escape';

export interface DumpConfig {
    batchSize?: number;
}

export class DumpGenerator extends Readable {
    private db: Database;
    private tables: string[];
    private currentTableIndex: number = 0;
    private isProcessing: boolean = false;
    private batchSize: number;

    constructor(db: Database, tables: string[], config: DumpConfig = {}) {
        super({
            encoding: 'utf8',
            highWaterMark: 1024 * 1024,
        });
        this.db = db;
        this.tables = tables;
        this.batchSize = config.batchSize || 1000;
    }

    _read(size: number) {
        if (!this.isProcessing) {
            this.processNextTable().catch((err) => {
                logger.error('Failed processing database dump', { error: err.message });
                this.destroy(err);
            });
        }
    }

    private async processNextTable() {
        this.isProcessing = true;

        if (this.currentTableIndex === 0) {
            this.push(`-- -----------------------------------------------------\n`);
            this.push(`--  ____               _               \n`);
            this.push(`-- |  _ \\             | |              \n`);
            this.push(`-- | |_) | __ _  ___| | _____ _ __ \n`);
            this.push(`-- |  _ < / _\` |/ __| |/ / _ \\ '__|\n`);
            this.push(`-- | |_) | (_| | (__|   <  __/ |   \n`);
            this.push(`-- |____/ \\__,_|\\___|_|\\_\\___|_|   \n`);
            this.push(`-- \n`);
            this.push(`-- Backed up using backer.\n`);
            this.push(`-- https://github.com/mafineeek/backer\n`);
            this.push(`-- -----------------------------------------------------\n\n`);

            this.push(`/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n`);
            this.push(`/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n`);
            this.push(`/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n`);
            this.push(`/*!40101 SET NAMES utf8mb4 */;\n`);
            this.push(`/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;\n`);
            this.push(`/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n`);
            this.push(`/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n`);
            this.push(`/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;\n\n`);
        }

        if (this.currentTableIndex >= this.tables.length) {
            // Dump footer
            this.push(`\n/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;\n`);
            this.push(`/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n`);
            this.push(`/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;\n`);
            this.push(`/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n`);
            this.push(`/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n`);
            this.push(`/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n`);
            this.push(`/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;\n`);

            this.push(null); // EOF
            return;
        }

        const table = this.tables[this.currentTableIndex];
        logger.info(`Starting backup for table`, { table });

        try {
            await this.dumpTableStructure(table);
            await this.dumpTableData(table);

            logger.info(`Finished backup for table`, { table });

            this.currentTableIndex++;
            this.isProcessing = false;

        } catch (error: any) {
            logger.error('Error dumping table', { table, error: error.message });
            throw error;
        }
    }

    private async dumpTableStructure(table: string) {
        this.push(`\n--\n-- Table structure for table ${escapeIdentifier(table)}\n--\n\n`);
        this.push(`DROP TABLE IF EXISTS ${escapeIdentifier(table)};\n`);

        // Fetch schema
        const pool = this.db.getPool();
        const [rows] = await pool.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE ${escapeIdentifier(table)}`);

        if (rows && rows.length > 0) {
            const createTableSql = rows[0]['Create Table'];
            this.push(`${createTableSql};\n\n`);
        }
    }

    private async dumpTableData(table: string) {
        this.push(`--\n-- Dumping data for table ${escapeIdentifier(table)}\n--\n\n`);

        let offset = 0;
        const pool = this.db.getPool();
        let hasMoreRows = true;

        this.push(`LOCK TABLES ${escapeIdentifier(table)} WRITE;\n/*!40000 ALTER TABLE ${escapeIdentifier(table)} DISABLE KEYS */;\n`);

        while (hasMoreRows) {
            const [rows] = await pool.query<mysql.RowDataPacket[]>(
                `SELECT * FROM ${escapeIdentifier(table)} LIMIT ? OFFSET ?`,
                [this.batchSize, offset]
            );

            if (rows.length === 0) {
                hasMoreRows = false;
                break;
            }

            let insertStatement = `INSERT INTO ${escapeIdentifier(table)} VALUES `;
            const valueSets: string[] = [];

            for (const row of rows) {
                const values = Object.values(row).map(val => escapeSqlValue(val));
                valueSets.push(`(${values.join(', ')})`);
            }

            insertStatement += valueSets.join(', ') + ';\n';

            this.push(insertStatement);

            offset += this.batchSize;
        }

        this.push(`/*!40000 ALTER TABLE ${escapeIdentifier(table)} ENABLE KEYS */;\nUNLOCK TABLES;\n`);
    }
}
