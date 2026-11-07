import pg from 'pg';

// Return BIGINT (int8) columns as numbers. Our ids, odometers and alarm codes
// stay far below 2^53, so this is safe and avoids strings everywhere.
pg.types.setTypeParser(20, (v) => Number(v));

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
