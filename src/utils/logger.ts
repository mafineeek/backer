export type LogLevel = 'info' | 'error' | 'warn';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, any>;
}

class Logger {
    private formatMessage(level: LogLevel, message: string, context?: Record<string, any>): string {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(context && { context })
        };
        return JSON.stringify(entry);
    }

    info(message: string, context?: Record<string, any>): void {
        process.stdout.write(this.formatMessage('info', message, context) + '\n');
    }

    warn(message: string, context?: Record<string, any>): void {
        process.stdout.write(this.formatMessage('warn', message, context) + '\n');
    }

    error(message: string, context?: Record<string, any>): void {
        process.stderr.write(this.formatMessage('error', message, context) + '\n');
    }
}

export const logger = new Logger();
