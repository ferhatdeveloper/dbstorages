/**
 * Legacy stub — Studio uses /api/db against real Database instances.
 * Kept so old imports fail closed instead of returning fake rows.
 */
export async function getTables(): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db schema endpoints');
}

export async function getTableData(_tableName: string): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db data endpoints');
}

export async function insertTableRow(_tableName: string, _row: unknown): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db data endpoints');
}

export async function updateTableRow(
  _tableName: string,
  _id: unknown,
  _row: unknown
): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db data endpoints');
}

export async function deleteTableRow(_tableName: string, _id: unknown): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db data endpoints');
}
