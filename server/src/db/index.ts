import pg from 'pg';

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 5, ssl: { rejectUnauthorized: true } });
}
let pool: pg.Pool | undefined;
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    pool = createPool(process.env.DATABASE_URL);
  }
  return pool;
}
export const query = (text: string, values?: unknown[]) => getPool().query(text, values);
