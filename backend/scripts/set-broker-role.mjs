import { config } from 'dotenv';
import pg from 'pg';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const [brokerId, role] = args;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (
  args.length !== 2 ||
  !uuid.test(brokerId ?? '') ||
  !['BROKER', 'OPERATOR'].includes(role)
) {
  process.stderr.write(
    'Usage: pnpm auth:set-role -- <brokerId UUID> <BROKER|OPERATOR>\n',
  );
  process.exitCode = 1;
} else {
  config({ quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    process.stderr.write('DATABASE_URL is required.\n');
    process.exitCode = 1;
  } else {
    const client = new pg.Client({ connectionString });
    let transactionStarted = false;
    try {
      await client.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        'SELECT role FROM brokers WHERE id = $1::uuid FOR UPDATE',
        [brokerId],
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        process.stderr.write('Broker not found.\n');
        process.exitCode = 1;
      } else {
        const previousRole = result.rows[0].role;
        await client.query(
          'UPDATE brokers SET role = $2::"BrokerRole", updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid',
          [brokerId, role],
        );
        await client.query('COMMIT');
        transactionStarted = false;
        process.stdout.write(
          `${JSON.stringify({ brokerId, previousRole, role })}\n`,
        );
      }
    } catch {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
      process.stderr.write(
        'Could not update broker role. Check database connectivity, privileges and migrations.\n',
      );
      process.exitCode = 1;
    } finally {
      await client.end().catch(() => {});
    }
  }
}
