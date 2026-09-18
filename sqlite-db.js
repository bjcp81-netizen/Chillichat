const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const dbPath = path.join(__dirname, "chillichat.db");
const db = new DatabaseSync(dbPath);

function convertSql(sql, params = []) {
  let converted = sql.trim();

  // PostgreSQL SERIAL -> SQLite
  converted = converted.replace(
    /\bSERIAL\s+PRIMARY\s+KEY\b/gi,
    "INTEGER PRIMARY KEY AUTOINCREMENT"
  );

  // PostgreSQL NOW() -> SQLite CURRENT_TIMESTAMP
  converted = converted.replace(
    /\bNOW\(\)/gi,
    "CURRENT_TIMESTAMP"
  );

  // PostgreSQL intervals -> SQLite datetime expressions
  converted = converted.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'24 hours'/gi,
    "datetime('now', '-24 hours')"
  );

  converted = converted.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'7 days'/gi,
    "datetime('now', '-7 days')"
  );

  converted = converted.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'1 hour'/gi,
    "datetime('now', '-1 hour')"
  );

  // PostgreSQL FILTER aggregates -> SQLite CASE expressions
  converted = converted.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+reaction\s*=\s*'chilli'\s*\)/gi,
    "COALESCE(SUM(CASE WHEN reaction = 'chilli' THEN 1 ELSE 0 END), 0)"
  );

  converted = converted.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+reaction\s*=\s*'heart'\s*\)/gi,
    "COALESCE(SUM(CASE WHEN reaction = 'heart' THEN 1 ELSE 0 END), 0)"
  );

  converted = converted.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+reaction\s*=\s*'laugh'\s*\)/gi,
    "COALESCE(SUM(CASE WHEN reaction = 'laugh' THEN 1 ELSE 0 END), 0)"
  );

  converted = converted.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+reaction\s*=\s*'down'\s*\)/gi,
    "COALESCE(SUM(CASE WHEN reaction = 'down' THEN 1 ELSE 0 END), 0)"
  );

  // PostgreSQL GREATEST -> SQLite MAX
  converted = converted.replace(
    /\bGREATEST\s*\(/gi,
    "MAX("
  );

  /*
   * PostgreSQL parameters -> SQLite parameters.
   *
   * Normal:
   *   $1 -> ?
   *
   * PostgreSQL:
   *   WHERE handle = ANY($1)
   *
   * becomes:
   *   WHERE handle IN (?, ?, ?)
   */

  const orderedParams = [];

  converted = converted.replace(
    /=\s*ANY\s*\(\s*\$(\d+)\s*\)|\$(\d+)/gi,
    function (match, anyNumber, normalNumber) {
      if (anyNumber !== undefined) {
        const value = params[Number(anyNumber) - 1];

        if (!Array.isArray(value) || value.length === 0) {
          return "IN (NULL)";
        }

        for (const item of value) {
          orderedParams.push(item);
        }

        return "IN (" + value.map(() => "?").join(", ") + ")";
      }

      const value = params[Number(normalNumber) - 1];

      orderedParams.push(value);

      return "?";
    }
  );

  return {
    sql: converted,
    params: orderedParams,
  };
}

function normaliseParams(params) {
  return params.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value === undefined) {
      return null;
    }

    return value;
  });
}

function hasReturning(sql) {
  return /\bRETURNING\b/i.test(sql);
}

async function query(sql, params = []) {
  /*
   * Handle PostgreSQL:
   *
   * ALTER TABLE table
   * ADD COLUMN IF NOT EXISTS column definition
   *
   * SQLite doesn't support IF NOT EXISTS for ADD COLUMN,
   * so we check first.
   */
  const alterMatch = sql.match(
    /^\s*ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+)\s+(.+?)\s*;?\s*$/is
  );

  if (alterMatch) {
    const [, table, column, definition] = alterMatch;

    const columns = db
      .prepare("PRAGMA table_info(" + table + ")")
      .all();

    const exists = columns.some(
      (columnInfo) =>
        columnInfo.name.toLowerCase() === column.toLowerCase()
    );

    if (!exists) {
      db.exec(
        "ALTER TABLE " +
          table +
          " ADD COLUMN " +
          column +
          " " +
          definition
      );
    }

    return {
      rows: [],
      rowCount: 0,
    };
  }

  const converted = convertSql(sql, params);
  const safeParams = normaliseParams(converted.params);

  const statement = db.prepare(converted.sql);

  // SELECT / PRAGMA / WITH queries
  if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(converted.sql)) {
    const rows = statement.all(...safeParams);

    return {
      rows,
      rowCount: rows.length,
    };
  }

  // INSERT / UPDATE / DELETE with RETURNING
  if (hasReturning(converted.sql)) {
    const rows = statement.all(...safeParams);

    return {
      rows,
      rowCount: rows.length,
    };
  }

  // Normal INSERT / UPDATE / DELETE
  const result = statement.run(...safeParams);

  return {
    rows: [],
    rowCount: Number(result.changes || 0),
  };
}

module.exports = {
  query,

  close() {
    db.close();
  },
};