/**
 * Properly escapes SQL values for MySQL
 */
export function escapeSqlValue(value: any): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }

    if (typeof value === 'number') {
        return value.toString();
    }

    if (value instanceof Date) {
        return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }

    if (Buffer.isBuffer(value)) {
        return `X'${value.toString('hex')}'`;
    }

    // String escaping
    let str = String(value);
    str = str.replace(/[\0\n\r\b\t\\'"\x1a]/g, function (s) {
        switch (s) {
            case '\0':
                return '\\0';
            case '\n':
                return '\\n';
            case '\r':
                return '\\r';
            case '\b':
                return '\\b';
            case '\t':
                return '\\t';
            case '\x1a':
                return '\\Z';
            case "'":
                return "''";
            case '"':
                return '\\"';
            case '\\':
                return '\\\\';
            default:
                return '\\' + s;
        }
    });

    return `'${str}'`;
}

/**
 * Escapes an identifier (table name, column name)
 */
export function escapeIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
}
