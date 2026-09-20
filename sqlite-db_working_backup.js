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

  // PostgreSQL intervals
  converted = converted.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'24 hours'/gi,
    "datetime('now', '-24 hours')"
  );

  converted = converted.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'7 days'/gi,
    "datetime('now', '-7 days')"
  );

  // PostgreSQL FILTER -> SQLite CASE
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

  // PostgreSQL numbered parameters $1, $2 etc.
  const orderedParams = [];

  converted = converted.replace(
    /\$(\d+)/g,
    (_, number) => {
      orderedParams.push(params[Number(number) - 1]);
      return "?";
    }
  );

  // PostgreSQL ANY($1) -> SQLite IN (?, ?, ?)
  if (/ANY\s*\(\s*\?\s*\)/i.test(converted)) {
    const arrayIndex = orderedParams.findIndex(
      (value) => Array.isArray(value)
    );

    if (arrayIndex !== -1) {
      const values = orderedParams[arrayIndex];

      if (values.length === 0) {
        converted = converted.replace(
          /ANY\s*\(\s*\?\s*\)/gi,
          "(NULL)"
        );

        orderedParams.splice(arrayIndex, 1);
      } else {
        const placeholders = values.map(() => "?").join(", ");

        converted = converted.replace(
          /ANY\s*\(\s*\?\s*\)/gi,
          `(${placeholders})`
        );

        orderedParams.splice(
          arrayIndex,
          1,
          ...values
        );
      }
    }
  }

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
  // SQLite does not support:
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS
  const alterMatch = sql.match(
    /^\s*ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+)\s+(.+?)\s*;?\s*$/is
  );

  if (alterMatch) {
    const [, table, column, definition] = alterMatch;

    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all();

    const exists = columns.some(
      (columnInfo) =>
        columnInfo.name.toLowerCase() === column.toLowerCase()
    );

    if (!exists) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
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

  if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(converted.sql)) {
    return {
      rows: statement.all(...safeParams),
      rowCount: 0,
    };
  }

  if (hasReturning(converted.sql)) {
    const rows = statement.all(...safeParams);

    return {
      rows,
      rowCount: rows.length,
    };
  }

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