// The production Database: a node-postgres Pool behind the same interface that PGlite instances have.
// Database: query(sql, params) -> Promise<{rows}>, and transaction(async (tx) => ...) where tx.query has the
// same shape; the transaction commits when the callback resolves and rolls back when it throws. close() ends the pool.
import pg from 'pg';

export function connect(url) {
  const pool = new pg.Pool({ connectionString: url });
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
