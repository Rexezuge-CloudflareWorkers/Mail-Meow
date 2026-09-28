/**
 * Minimal SQL statement splitter for SQLite migration files.
 *
 * Handles: single/double/backtick quoted strings (incl. `''` escapes),
 * `--` line comments, `/* ... *\/` block comments. Semicolons inside strings
 * or comments do not split. This replaces the naive quote-only splitter that
 * broke on semicolons in comments.
 */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === stringChar) {
        // SQL escapes a quote by doubling it ('it''s'); do not end the string.
        if (sql[i + 1] === stringChar) {
          current += sql[i + 1];
          i += 2;
          continue;
        }
        if (sql[i - 1] !== '\\') inString = false;
      }
      i++;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;
      current += ch;
      i++;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

interface MigrationFile {
  name: string;
  sql: string;
}

/** Migration files in apply order. */
function migrationFiles(): MigrationFile[] {
  const files = typeof __INTEGRATION_MIGRATION_FILES__ === 'undefined' ? null : __INTEGRATION_MIGRATION_FILES__;
  if (files && files.length > 0) return [...files];
  // Fallback for a harness that only injects the flattened string.
  return [{ name: 'all.sql', sql: __INTEGRATION_MIGRATION_SQL__ }];
}

/** Names of the embedded migration files, in apply order. */
export function migrationFileNames(): string[] {
  return migrationFiles().map((file) => file.name);
}

/** Executable statements of one file, with pure-comment statements dropped. */
function executableStatements(sql: string): string[] {
  return splitSql(sql).filter((stmt) => {
    if (stmt.length === 0) return false;
    const withoutComments = stmt
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return withoutComments.length > 0;
  });
}

/** Strip leading `--` / block comments, which the splitter folds into the statement. */
function stripLeadingComments(stmt: string): string {
  let out = stmt;
  for (;;) {
    const next = out.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/, '');
    if (next === out) return out.trim();
    out = next;
  }
}

/**
 * Apply one migration file, one statement at a time.
 *
 * Deliberately not `db.batch()`: a batch is prepared in full before the first
 * statement executes, so a file that both adds a column and creates a table
 * referencing it fails with `foreign key mismatch` — the new table's FK is
 * validated against a schema that the `ADD COLUMN` has not reached yet. That is
 * exactly the shape of `0011_user_identity.sql`, and it is also the shape
 * `wrangler d1 migrations apply` executes a file in.
 *
 * Each `run()` is its own implicit transaction, which is what lets a statement
 * observe the schema the previous one left behind.
 */
async function applyMigrationFile(db: D1Database, file: MigrationFile): Promise<void> {
  const statements = executableStatements(file.sql);
  for (const [index, statement] of statements.entries()) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      // Name the failing statement: the file name alone leaves the reader
      // bisecting a 100-line migration.
      throw new Error(
        `${file.name}: statement ${index + 1}/${statements.length} failed: ${stripLeadingComments(statement).slice(0, 200)}\n${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

/**
 * Apply a range of migrations, defaulting to every file.
 *
 * `from`/`to` are file names (`0010_user_language.sql`). A range is what the
 * identity-upgrade test needs: apply up to `0010`, seed a populated legacy
 * database, then apply `0011` alone and assert nothing was lost.
 */
export async function applyMigrations(db: D1Database, range?: { from?: string; to?: string }): Promise<void> {
  const files = migrationFiles();
  const indexOf = (name: string | undefined, fallback: number): number => {
    if (!name) return fallback;
    const found = files.findIndex((file) => file.name === name);
    if (found === -1) {
      throw new Error(`Unknown migration file: ${name}. Available: ${files.map((file) => file.name).join(', ')}`);
    }
    return found;
  };
  const start = indexOf(range?.from, 0);
  const end = indexOf(range?.to, files.length - 1);
  for (const file of files.slice(start, end + 1)) {
    await applyMigrationFile(db, file);
  }
}

export { splitSql };
