// The schema migrations in server/migrations/*.sql apply once each, in name order, and schema_migrations records them.
// A file holds statements that each end with a semicolon at the end of a line.
// Run: DATABASE_URL_UNPOOLED=<url> pnpm migrate
import { readdir, readFile } from 'node:fs/promises';
import { connect } from './postgres.js';

const DIR = new URL('./migrations/', import.meta.url);

// db has the Database shape of server/postgres.js. Each file applies in its own transaction.
// Returns the names of the files applied by this call, in order.
export async function migrate(db) {
  await db.query('create table if not exists schema_migrations (name text primary key)', []);
  const done = new Set((await db.query('select name from schema_migrations', [])).rows.map((r) => r.name));
  const names = (await readdir(DIR)).filter((n) => n.endsWith('.sql') && !done.has(n)).sort();
  for (const name of names) {
    const statements = (await readFile(new URL(name, DIR), 'utf8')).split(/;\s*$/m).filter((s) => s.trim());
    await db.transaction(async (tx) => {
      for (const sql of statements) await tx.query(sql, []);
      await tx.query('insert into schema_migrations (name) values ($1)', [name]);
    });
  }
  return names;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('Set DATABASE_URL_UNPOOLED to the direct connection string of a verified non-production database.');
    process.exit(1);
  }
  const db = connect(url);
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Nothing to apply');
  } finally {
    await db.close();
  }
}
