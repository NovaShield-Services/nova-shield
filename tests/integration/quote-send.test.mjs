// Section H -- mark_quote_sent, tested through the real admin-gated RPC.
// Every scenario below was first proven against the live database with a
// rolled-back verification script before being transcribed here; see the
// Phase B report for the exact output.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withAdminTx, dropAdminClaim, expectRejection, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService, createDraftQuote, addLineItem } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function send(client, quoteId) {
  await client.query('select mark_quote_sent($1)', [quoteId]);
}
async function getQuote(client, quoteId) {
  const { rows } = await client.query('select * from ns_quotes where id = $1', [quoteId]);
  return rows[0];
}
async function getJob(client, jobId) {
  const { rows } = await client.query('select * from ns_jobs where id = $1', [jobId]);
  return rows[0];
}
async function countNotifications(client, jobId) {
  const { rows } = await client.query('select count(*)::int as n from notifications where job_id = $1', [jobId]);
  return rows[0].n;
}
async function latestNotification(client, jobId) {
  const { rows } = await client.query(`select * from notifications where job_id = $1 order by created_at desc limit 1`, [jobId]);
  return rows[0];
}

/** A draft quote with one line item, ready to send -- createJob always
 *  gives the customer an email, so this is the "happy path" fixture. */
async function createSendableDraft(client, prefix, { version = 1, parentQuoteId = null, jobId = null } = {}) {
  const siding = await getService(client, 'siding');
  if (!jobId) ({ jobId } = await createJob(client, prefix));
  const quote = await createDraftQuote(client, jobId, { version, parentQuoteId });
  await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: true, amount: 500 });
  return { jobId, quoteId: quote.id };
}

async function main() {
  await record('mark_quote_sent is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSendableDraft(client, runId());
      await dropAdminClaim(client);
      let blocked = false;
      try { await send(client, quoteId); } catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  await record('mark_quote_sent: success sets quote/job status, stamps sent_at, and queues exactly one quote_ready notification', async () => {
    await withAdminTx(async (client) => {
      const { jobId, quoteId } = await createSendableDraft(client, runId());
      const before = await countNotifications(client, jobId);

      await send(client, quoteId);

      const quote = await getQuote(client, quoteId);
      if (quote.status !== 'sent') throw new Error(`expected quote status 'sent', got ${quote.status}`);
      if (quote.sent_at === null) throw new Error('expected sent_at to be stamped');

      const job = await getJob(client, jobId);
      if (job.status !== 'quote_sent') throw new Error(`expected job status 'quote_sent', got ${job.status}`);

      const after = await countNotifications(client, jobId);
      if (after !== before + 1) throw new Error(`expected exactly one new notification, went from ${before} to ${after}`);
      const notif = await latestNotification(client, jobId);
      if (notif.kind !== 'quote_ready') throw new Error(`expected notification kind 'quote_ready', got ${notif.kind}`);
      if (notif.channel !== 'email') throw new Error(`expected notification channel 'email', got ${notif.channel}`);
      if (!notif.recipient || !notif.recipient.includes('@')) throw new Error(`expected a real recipient email, got ${JSON.stringify(notif.recipient)}`);
    });
  });

  await record('mark_quote_sent blocks re-sending an already-sent quote, and does not touch the original sent_at', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSendableDraft(client, runId());
      await send(client, quoteId);
      const before = await getQuote(client, quoteId);

      const err = await expectRejection(client, () => send(client, quoteId));
      if (!/already been sent/i.test(err.message)) throw new Error(`expected the already-sent message, got: ${err.message}`);

      const after = await getQuote(client, quoteId);
      if (after.sent_at.getTime() !== before.sent_at.getTime()) throw new Error('a blocked re-send must not change the original sent_at');
    });
  });

  await record('mark_quote_sent supersedes a prior sent version on the same job when a newer version is sent', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const { jobId, quoteId: v1 } = await createSendableDraft(client, prefix, { version: 1 });
      await send(client, v1);
      const { quoteId: v2 } = await createSendableDraft(client, prefix, { version: 2, parentQuoteId: v1, jobId });

      await send(client, v2);

      const quote1 = await getQuote(client, v1);
      const quote2 = await getQuote(client, v2);
      if (quote1.status !== 'superseded') throw new Error(`expected the earlier sent version to become 'superseded', got ${quote1.status}`);
      if (quote2.status !== 'sent') throw new Error(`expected the newly-sent version to be 'sent', got ${quote2.status}`);
    });
  });

  await record('mark_quote_sent refuses to send when the customer has no email on file, and nothing changes', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const cust = await client.query(`insert into customers (name, email) values ($1, '') returning id`, [`${prefix} Customer`]);
      const prop = await client.query(`insert into properties (customer_id, address_line1, city) values ($1, $2, 'Testville') returning id`, [cust.rows[0].id, `1 ${prefix} Way`]);
      const job = await client.query(`insert into ns_jobs (customer_id, property_id, title, status) values ($1, $2, $3, 'new') returning id`, [cust.rows[0].id, prop.rows[0].id, `${prefix} job`]);
      const jobId = job.rows[0].id;
      const quote = await createDraftQuote(client, jobId);
      await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: true, amount: 500 });

      const beforeNotifications = await countNotifications(client, jobId);
      const err = await expectRejection(client, () => send(client, quote.id));
      if (!/no email address on file/i.test(err.message)) throw new Error(`expected the no-email message, got: ${err.message}`);

      const afterQuote = await getQuote(client, quote.id);
      const afterJob = await getJob(client, jobId);
      const afterNotifications = await countNotifications(client, jobId);
      if (afterQuote.status !== 'draft') throw new Error(`a blocked send must leave the quote as 'draft', got ${afterQuote.status}`);
      if (afterJob.status !== 'new') throw new Error(`a blocked send must not change job status, got ${afterJob.status}`);
      if (afterNotifications !== beforeNotifications) throw new Error(`a blocked send must not queue any notification: was ${beforeNotifications}, now ${afterNotifications}`);
    });
  });

  await printResultsAndExit();
}

async function printResultsAndExit() {
  const tally = printResults(results);
  if (isConfigured()) await closePool();
  if (tally.failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  if (isConfigured()) await closePool();
  process.exit(1);
});
