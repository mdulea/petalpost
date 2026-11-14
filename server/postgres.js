// The production Database: a node-postgres Pool behind the same interface that PGlite instances have.
// Database: query(sql, params) -> Promise<{rows}>, and transaction(async (tx) => ...) where tx.query has the
// same shape; the transaction commits when the callback resolves and rolls back when it throws. close() ends the pool.
import pg from 'pg';

// url is a Postgres connection string, or undefined without a database, which makes every query fail.
// sslmode require, prefer and verify-ca become verify-full, the behavior node-postgres 8 already gives them.
// pg 9 gives those modes libpq's weaker meaning. The Neon integration owns DATABASE_URL, so the mode is set here.
export function connect(url) {
  const pool = new pg.Pool({
    connectionString: url?.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, '$1verify-full'),
  });
  // An idle client that loses its connection must not crash the process; the next query reports the failure.
  pool.on('error', (error) => console.error('postgres pool error', /** @type {any} */ (error).code ?? 'unknown'));
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await callback({ query: (sql, params) => client.query(sql, params) });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
