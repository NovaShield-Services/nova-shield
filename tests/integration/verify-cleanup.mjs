// Section L: run once, after every tests/integration/*.test.mjs file has
// finished, as its own short-lived process/connection -- never from inside
// any single test's own transaction. Every test in this suite already
// rolls back its own transaction, which should make a leak structurally
// impossible; this script is the "do not simply assume cleanup succeeded"
// proof, not a cleanup step itself. Invoked by tests/run-integration.sh,
// and only when SUPABASE_DB_URL is actually set -- with no DB configured
// there is nothing to check.

import { verifyNoLeakedTestData, closePool } from './db-client.mjs';

const { clean, leaks } = await verifyNoLeakedTestData();
await closePool();

if (clean) {
  console.log('PASS - no TEST_INTEGRATION_-prefixed synthetic rows remain in any table');
  process.exit(0);
} else {
  console.error('FAIL - synthetic test data leaked and was not rolled back:');
  for (const leak of leaks) console.error(`  ${leak.table}: ${leak.count} row(s)`);
  process.exit(1);
}
