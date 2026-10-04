// Same record()/tally convention as tests/test-harness.mjs's createRecorder,
// extended with an explicit SKIPPED state: a skipped real-DB test must never
// print or count as a pass (Phase B, Section M).

// configured=false turns every record() call into a skip() instead of
// actually invoking the test function -- so an unconfigured environment
// never even attempts a connection, let alone silently passes. Every test
// file is written the same way regardless (`await record(name, fn)`); only
// this one flag, set from db-client.mjs's isConfigured(), decides whether
// fn ever runs.
export function createIntegrationRecorder(configured) {
  const results = [];

  function record(name, fn) {
    if (!configured) return skip(name, 'SUPABASE_DB_URL not set -- see tests/README.md');
    return Promise.resolve().then(fn).then(
      () => results.push({ name, status: 'PASS' }),
      (err) => results.push({ name, status: 'FAIL', err: err.message || String(err) })
    );
  }

  function skip(name, reason) {
    results.push({ name, status: 'SKIPPED', err: reason });
    return Promise.resolve();
  }

  return { results, record, skip };
}

export function printResults(results) {
  for (const r of results) {
    if (r.status === 'PASS') console.log(`PASS - ${r.name}`);
    else if (r.status === 'SKIPPED') console.log(`SKIPPED - ${r.name}\n     ${r.err}`);
    else console.log(`FAIL - ${r.name}\n     ${r.err}`);
  }
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total)`);
  return { passed, failed, skipped, total: results.length };
}
