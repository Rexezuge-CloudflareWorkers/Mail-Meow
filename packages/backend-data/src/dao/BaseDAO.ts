import type { D1Queryable } from '../utils';
import { executeD1WithRetry } from '../utils';

const SQL_IDENTIFIER_PATTERN = /^[a-z_]\w*$/i;

function assertSqlIdentifier(value: string, label: string): void {
  if (!SQL_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${value}`);
  }
}

abstract class BaseDAO {
  constructor(protected readonly database: D1Queryable) {}

  /**
   * Runs a mutating statement with retry and a guaranteed `DatabaseError` on
   * failure.
   *
   * Every write in this layer goes through here. Hand-rolling `.run()` plus
   * `if (!result.success) throw new DatabaseError(...)` looked equivalent but
   * silently produced `retryable: false` and skipped the retry entirely, which
   * left the most failure-sensitive writes — creating and consuming OAuth2
   * sessions, updating credentials — with no recovery from a transient D1 lock.
   */
  protected async runWithRetry(statement: () => Promise<D1Result>, context: string): Promise<D1Result> {
    return executeD1WithRetry(statement, context);
  }

  // Generic row lookup by primary key. Table/column identifiers are allow-listed
  // to keep dynamic SQL safe; values always go through bindings.
  protected static async findById<T>(db: D1Queryable, table: string, idColumn: string, idValue: string, columns = '*'): Promise<T | null> {
    assertSqlIdentifier(table, 'table');
    assertSqlIdentifier(idColumn, 'idColumn');
    let selectColumns = '*';
    if (columns !== '*') {
      const validated: string[] = columns.split(',').map((column: string): string => {
        const trimmed: string = column.trim();
        assertSqlIdentifier(trimmed, 'column');
        return trimmed;
      });
      selectColumns = validated.join(', ');
    }
    const row: T | null = await db.prepare(`SELECT ${selectColumns} FROM ${table} WHERE ${idColumn} = ? LIMIT 1`).bind(idValue).first<T>();
    return row ?? null;
  }
}

abstract class EncryptedDAO extends BaseDAO {
  constructor(
    database: D1Queryable,
    protected readonly masterKey: string,
  ) {
    super(database);
  }
}

export { BaseDAO, EncryptedDAO };
