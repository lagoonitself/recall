import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { createPool } from './index.js';

export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(762414921)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = join(dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');
    const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) continue;
      await client.query(await readFile(join(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      console.log('Applying migration', name);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
