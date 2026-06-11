const ALLOWED_COLUMNS_BY_TABLE = {
  leadership_members: new Set(['avatar_url']),
  partner_fleets: new Set(['photo_url'])
};

export async function tableHasColumn(db, tableName, columnName) {
  const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[tableName];
  if (!allowedColumns || !allowedColumns.has(columnName)) {
    throw new Error(`Unsupported schema check: ${tableName}.${columnName}`);
  }

  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return (result.results || []).some((row) => row.name === columnName);
}
