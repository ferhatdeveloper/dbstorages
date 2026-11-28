/**
 * Legacy stub — Studio uses real Database API. Fake row helpers removed.
 */
export async function getTables(): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db');
}

export async function getTableData(_tableName: string): Promise<never> {
  throw new Error('mockTableApi removed — use /api/db');
}
