import { vi } from 'vitest';
import type { D1Queryable, D1Result } from '@mail-meow/backend-data/utils';

/**
 * Minimal D1 double.
 *
 * `prepare().bind().run/first/all` is a fluent chain, so the mock records the SQL
 * and bindings on the statement itself and returns whatever the test queued.
 * Statement-level assertions are what make it possible to prove a query is
 * parameterised rather than interpolated.
 */
export interface MockStatement {
  sql: string;
  bindings: unknown[];
  run: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  firstT: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
}

export interface MockDb {
  db: D1Queryable;
  statements: MockStatement[];
  /** The single statement issued, for focused assertions. */
  only: () => MockStatement;
  /** The nth statement issued. Use when a method legitimately runs several. */
  statementAt: (index: number) => MockStatement;
}

function makeResult<T>(results: T[], changes?: number): D1Result<T> {
  return {
    success: true,
    results,
    meta: changes === undefined ? {} : { changes },
  } as unknown as D1Result<T>;
}

export function makeFailedResult(error: string): D1Result {
  return { success: false, error, results: [], meta: {} } as unknown as D1Result;
}

/**
 * @param responses - queued results, one per statement, in issue order. A single
 *   value is reused for every statement.
 */
export function createMockDb(responses: Array<Partial<D1Result> | unknown[]> = []): MockDb {
  const statements: MockStatement[] = [];
  // One queue for the whole database, not one per statement: a method that runs
  // several statements (create-then-read) must consume responses in issue order,
  // which is how the real D1 binding behaves.
  let issued = 0;

  const db = {
    prepare(sql: string) {
      const statement: MockStatement = {
        sql,
        bindings: [],
        run: vi.fn(),
        first: vi.fn(),
        firstT: vi.fn(),
        all: vi.fn(),
      };
      // A queued `null` is a meaningful response meaning "no row", so it must not
      // be coalesced to `{ results: [] }` — that would make every missing-row case
      // look like a hit. The counter is the database-wide one above, so a
      // create-then-read consumes responses in issue order.
      const next = (): unknown => {
        const index = issued++;
        if (responses.length === 0) {
          return { results: [] };
        }
        const chosen: unknown = responses[Math.min(index, responses.length - 1)];
        return chosen === undefined ? { results: [] } : chosen;
      };

      statement.run.mockImplementation((): Promise<D1Result> => {
        const response = next();
        const asResult = Array.isArray(response) ? makeResult([], 1) : ({ ...(response as object) } as D1Result);
        return Promise.resolve({ success: true, results: [], meta: { changes: 1 }, ...asResult });
      });
      statement.first.mockImplementation((): Promise<unknown> => {
        const response = next();
        return Promise.resolve(Array.isArray(response) ? (response[0] ?? null) : response);
      });
      statement.firstT.mockImplementation((): Promise<unknown> => statement.first());
      statement.all.mockImplementation((): Promise<D1Result> => {
        const response = next();
        return Promise.resolve(Array.isArray(response) ? makeResult(response) : ({ ...(response as object) } as D1Result));
      });

      statements.push(statement);

      return {
        bind(...values: unknown[]) {
          statement.bindings = values;
          return {
            run: statement.run,
            first: statement.first,
            all: statement.all,
          };
        },
        run: statement.run,
        first: statement.first,
        all: statement.all,
      };
    },
  } as unknown as D1Queryable;

  return {
    db,
    statements,
    only: (): MockStatement => {
      if (statements.length !== 1) {
        throw new Error(`Expected exactly 1 statement, saw ${statements.length}. Use statementAt() instead.`);
      }
      return statements[0];
    },
    statementAt: (index: number): MockStatement => {
      const statement = statements[index];
      if (!statement) {
        throw new Error(`No statement at index ${index}; saw ${statements.length}`);
      }
      return statement;
    },
  };
}

/** A D1 double whose every statement reports the given failure. */
export function createFailingDb(error: string): D1Queryable {
  return {
    prepare: () => ({
      bind: () => ({
        run: vi.fn().mockResolvedValue(makeFailedResult(error)),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue(makeFailedResult(error)),
      }),
    }),
  } as unknown as D1Queryable;
}
