// Sections F, G -- the Phase 16/Phase A acceptance-safety behavior, tested
// against the real respond_to_quote (public, no auth gate) and
// save_quote_signature (admin-gated) RPCs.
//
// respond_to_quote has no is_admin() check at all -- it's the one RPC a real
// customer calls directly -- so its tests run under withTx (no synthetic
// admin claim), per db-client.mjs's own guidance: simulating "being" anyone
// would not be testing anything real here. save_quote_signature IS
// admin-gated (it's the admin signature-pad flow), so its tests run under
// withAdminTx.

import { createIntegrationRecorder, printResults } from './reporter.mjs';
import { withTx, withAdminTx, dropAdminClaim, expectRejection, closePool, runId, isConfigured } from './db-client.mjs';
import { createJob, getService, createDraftQuote, addLineItem, markSentDirect } from './helpers.mjs';

const { results, record } = createIntegrationRecorder(isConfigured());

async function respond(client, quoteId, response) {
  const { rows } = await client.query('select respond_to_quote($1, $2) as result', [quoteId, response]);
  return rows[0].result;
}
async function sign(client, quoteId, path, name) {
  await client.query('select save_quote_signature($1, $2, $3)', [quoteId, path, name]);
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

/** A sent quote with exactly one line item, whose pricing_approved is under
 *  the caller's control -- respond_to_quote only reads that stored boolean,
 *  it never re-derives it, so this is a faithful setup without re-exercising
 *  create_quote_from_calculation. */
async function createSentQuoteWithApproval(client, prefix, approved) {
  const siding = await getService(client, 'siding');
  const { jobId } = await createJob(client, prefix);
  const quote = await createDraftQuote(client, jobId);
  await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: approved, amount: 500 });
  await markSentDirect(client, quote.id);
  return { jobId, quoteId: quote.id };
}

async function main() {
  // -- Section F: respond_to_quote ------------------------------------

  await record('respond_to_quote: accepting a fully-approved quote succeeds and updates quote/job/notifications', async () => {
    await withTx(async (client) => {
      const { jobId, quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      const before = await countNotifications(client, jobId);

      const result = await respond(client, quoteId, 'accepted');
      if (result !== 'accepted') throw new Error(`expected 'accepted', got ${result}`);

      const quote = await getQuote(client, quoteId);
      if (quote.status !== 'accepted') throw new Error(`expected quote status 'accepted', got ${quote.status}`);
      if (quote.responded_at === null) throw new Error('expected responded_at to be set');

      const job = await getJob(client, jobId);
      if (job.status !== 'accepted') throw new Error(`expected job status 'accepted', got ${job.status}`);

      const after = await countNotifications(client, jobId);
      if (after !== before + 1) throw new Error(`expected exactly one new notification, went from ${before} to ${after}`);
      const { rows } = await client.query(`select kind, subject from notifications where job_id = $1 order by created_at desc limit 1`, [jobId]);
      if (rows[0].kind !== 'quote_response') throw new Error(`expected notification kind 'quote_response', got ${rows[0].kind}`);
    });
  });

  await record('HISTORICAL/Phase A: accepting a quote with unapproved (provisional) pricing is rejected, and nothing changes', async () => {
    await withTx(async (client) => {
      const { jobId, quoteId } = await createSentQuoteWithApproval(client, runId(), false);
      const beforeQuote = await getQuote(client, quoteId);
      const beforeJob = await getJob(client, jobId);
      const beforeNotifications = await countNotifications(client, jobId);

      const err = await expectRejection(client, () => respond(client, quoteId, 'accepted'));
      if (!/Final pricing is still pending confirmation/.test(err.message)) {
        throw new Error(`expected the provisional-pricing rejection message, got: ${err.message}`);
      }

      const afterQuote = await getQuote(client, quoteId);
      const afterJob = await getJob(client, jobId);
      const afterNotifications = await countNotifications(client, jobId);
      if (afterQuote.status !== beforeQuote.status || afterQuote.status !== 'sent') throw new Error(`a blocked accept must not change quote status: was ${beforeQuote.status}, now ${afterQuote.status}`);
      if (afterQuote.responded_at !== null) throw new Error('a blocked accept must not set responded_at');
      if (afterJob.status !== beforeJob.status) throw new Error(`a blocked accept must not change job status: was ${beforeJob.status}, now ${afterJob.status}`);
      if (afterNotifications !== beforeNotifications) throw new Error(`a blocked accept must not queue any notification: was ${beforeNotifications}, now ${afterNotifications}`);
    });
  });

  await record('decline always succeeds, even for a quote with unapproved pricing', async () => {
    await withTx(async (client) => {
      const { jobId, quoteId } = await createSentQuoteWithApproval(client, runId(), false);
      const result = await respond(client, quoteId, 'declined');
      if (result !== 'declined') throw new Error(`expected 'declined', got ${result}`);
      const quote = await getQuote(client, quoteId);
      if (quote.status !== 'declined') throw new Error(`expected quote status 'declined', got ${quote.status}`);
      const job = await getJob(client, jobId);
      if (job.status !== 'declined') throw new Error(`expected job status 'declined', got ${job.status}`);
    });
  });

  await record('respond_to_quote rejects a response value other than accepted/declined', async () => {
    await withTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      const err = await expectRejection(client, () => respond(client, quoteId, 'maybe'));
      if (!/Invalid response/i.test(err.message)) throw new Error(`expected 'Invalid response.', got: ${err.message}`);
    });
  });

  await record('respond_to_quote rejects a quote that is not currently sent (e.g. still draft)', async () => {
    await withTx(async (client) => {
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, runId());
      const quote = await createDraftQuote(client, jobId);
      await addLineItem(client, quote.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: true, amount: 500 });
      // left as 'draft' -- never sent

      const err = await expectRejection(client, () => respond(client, quote.id, 'accepted'));
      if (!/no longer open for a response/i.test(err.message)) throw new Error(`expected the not-open-for-response message, got: ${err.message}`);
    });
  });

  // -- Section G: save_quote_signature ---------------------------------

  await record('save_quote_signature is blocked for a non-admin claim', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      await dropAdminClaim(client);
      let blocked = false;
      try { await sign(client, quoteId, 'sigs/test.png', 'A Customer'); } catch (err) { blocked = /not authorised/i.test(err.message); }
      if (!blocked) throw new Error('expected a non-admin claim to be rejected with "Not authorised."');
    });
  });

  await record('save_quote_signature signs a fully-approved quote normally', async () => {
    await withAdminTx(async (client) => {
      const { jobId, quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      await sign(client, quoteId, 'sigs/test.png', 'A Customer');
      const quote = await getQuote(client, quoteId);
      if (quote.status !== 'accepted') throw new Error(`expected status 'accepted', got ${quote.status}`);
      if (quote.signature_url !== 'sigs/test.png') throw new Error('signature_url was not stored');
      if (quote.signed_by_name !== 'A Customer') throw new Error('signed_by_name was not stored');
      if (quote.signed_at === null) throw new Error('signed_at was not set');
      const job = await getJob(client, jobId);
      if (job.status !== 'accepted') throw new Error(`expected job status 'accepted', got ${job.status}`);
    });
  });

  await record('FINDING (Phase 16/A): save_quote_signature has no DB-level pricing gate -- it signs a provisional (unapproved) quote exactly as readily', async () => {
    // The admin signature pad's extra confirm-text warning (Phase A) is a
    // client-side-only concept. This test documents, rather than "fixes",
    // that the RPC itself still allows it -- changing that would be a
    // product decision, not a test-authoring one.
    await withAdminTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), false);
      await sign(client, quoteId, 'sigs/test.png', 'A Customer'); // must not throw
      const quote = await getQuote(client, quoteId);
      if (quote.status !== 'accepted') throw new Error(`expected a provisional quote to still sign through to 'accepted', got ${quote.status}`);
    });
  });

  await record('save_quote_signature requires a non-empty signature path', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      const err = await expectRejection(client, () => sign(client, quoteId, '   ', 'A Customer'));
      if (!/signature image is required/i.test(err.message)) throw new Error(`expected the signature-required message, got: ${err.message}`);
    });
  });

  await record('save_quote_signature requires a non-empty signer name', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      const err = await expectRejection(client, () => sign(client, quoteId, 'sigs/test.png', ''));
      if (!/signer's name is required/i.test(err.message)) throw new Error(`expected the signer-name-required message, got: ${err.message}`);
    });
  });

  await record('save_quote_signature blocks re-signing an already-accepted quote, and leaves the first signature untouched', async () => {
    await withAdminTx(async (client) => {
      const { quoteId } = await createSentQuoteWithApproval(client, runId(), true);
      await sign(client, quoteId, 'sigs/first.png', 'First Signer');
      const err = await expectRejection(client, () => sign(client, quoteId, 'sigs/second.png', 'Second Signer'));
      if (!/already accepted and cannot be signed again/i.test(err.message)) throw new Error(`expected the already-signed message, got: ${err.message}`);
      const quote = await getQuote(client, quoteId);
      if (quote.signature_url !== 'sigs/first.png') throw new Error('the blocked re-sign must not overwrite the original signature');
      if (quote.signed_by_name !== 'First Signer') throw new Error('the blocked re-sign must not overwrite the original signer name');
    });
  });

  await record('save_quote_signature supersedes a sibling sent quote on the same job when signing the other one', async () => {
    await withAdminTx(async (client) => {
      const prefix = runId();
      const siding = await getService(client, 'siding');
      const { jobId } = await createJob(client, prefix);
      const v1 = await createDraftQuote(client, jobId, { version: 1 });
      await addLineItem(client, v1.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: true, amount: 500 });
      await markSentDirect(client, v1.id);
      const v2 = await createDraftQuote(client, jobId, { version: 2, parentQuoteId: v1.id });
      await addLineItem(client, v2.id, siding.id, { description: 'Siding / Soft Wash', pricingApproved: true, amount: 550 });
      await markSentDirect(client, v2.id);

      await sign(client, v2.id, 'sigs/v2.png', 'A Customer');

      const quote1 = await getQuote(client, v1.id);
      const quote2 = await getQuote(client, v2.id);
      if (quote1.status !== 'superseded') throw new Error(`expected the un-signed sibling to become 'superseded', got ${quote1.status}`);
      if (quote2.status !== 'accepted') throw new Error(`expected the signed quote to become 'accepted', got ${quote2.status}`);
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
