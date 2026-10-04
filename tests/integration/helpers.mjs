// Synthetic data factories for the integration suite. Every row created
// here lives only inside the caller's transaction (see db-client.mjs) --
// these helpers never commit anything themselves.

/** customers/properties/ns_jobs: the minimum chain every measurement needs. */
export async function createJob(client, prefix, { customerName, address } = {}) {
  const cust = await client.query(
    `insert into customers (name, email) values ($1, $2) returning id`,
    [customerName || `${prefix} Customer`, `${prefix.toLowerCase()}@example.invalid`]
  );
  const customerId = cust.rows[0].id;

  const prop = await client.query(
    `insert into properties (customer_id, address_line1, city) values ($1, $2, 'Testville') returning id`,
    [customerId, address || `1 ${prefix} Way`]
  );
  const propertyId = prop.rows[0].id;

  const job = await client.query(
    `insert into ns_jobs (customer_id, property_id, title, status) values ($1, $2, $3, 'new') returning id`,
    [customerId, propertyId, `${prefix} job`]
  );
  const jobId = job.rows[0].id;

  return { customerId, propertyId, jobId };
}

export async function createSection(client, jobId, { name, storeys = '1_storey', access = 'easy', ground = 'flat', ladder = 'normal', distance = 'close' } = {}) {
  const { rows } = await client.query(
    `insert into job_sections (job_id, name, storeys, access, ground, ladder, distance)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [jobId, name || 'Section', storeys, access, ground, ladder, distance]
  );
  return rows[0];
}

export async function createMeasurement(client, jobId, serviceId, { sectionId = null, quantity = 1, unit = 'sq_ft', label = 'Area', reviewRequired = false, reviewReason = null } = {}) {
  const { rows } = await client.query(
    `insert into job_measurements (job_id, service_id, section_id, quantity, unit, label, review_required, review_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [jobId, serviceId, sectionId, quantity, unit, label, reviewRequired, reviewReason]
  );
  return rows[0];
}

export async function attachModifier(client, measurementId, modifierId) {
  await client.query(
    `insert into measurement_modifiers (measurement_id, modifier_id) values ($1, $2)`,
    [measurementId, modifierId]
  );
}

/** Looks up a service's id/unit/name/parent_key by key -- every test needs
 *  this rather than hardcoding ids, since ids are environment-specific. */
export async function getService(client, key) {
  const { rows } = await client.query(
    `select id, key, name, unit, category, parent_key, quotable, active from services where key = $1`,
    [key]
  );
  if (!rows[0]) throw new Error(`Service not found: ${key} (has the seed data changed?)`);
  return rows[0];
}

/** The service's current (effective now) pricing_rules row, or null if
 *  genuinely unpriced (e.g. Heating Wire's valley/corner children). */
export async function getCurrentRate(client, serviceId) {
  const { rows } = await client.query(
    `select rate, minimum, approval_status from pricing_rules
     where service_id = $1 and effective_from <= now() and (effective_to is null or effective_to > now())
     order by effective_from desc limit 1`,
    [serviceId]
  );
  return rows[0] || null;
}

/** One modifier option by (service key, group_key, option_key) -- the real
 *  row, not a guessed id. */
export async function getModifier(client, serviceKey, groupKey, optionKey) {
  const { rows } = await client.query(
    `select pm.* from pricing_modifiers pm join services s on s.id = pm.service_id
     where s.key = $1 and pm.group_key = $2 and pm.option_key = $3 and pm.active`,
    [serviceKey, groupKey, optionKey]
  );
  if (!rows[0]) throw new Error(`Modifier not found: ${serviceKey}/${groupKey}/${optionKey} (has the seed data changed?)`);
  return rows[0];
}

/** Builds a draft quote directly (not through create_quote_from_calculation)
 *  for tests that need a quote to already exist -- e.g. duplication,
 *  acceptance, send -- without re-exercising quote creation every time.
 *  Still only ever used inside a transaction that rolls back. */
export async function createDraftQuote(client, jobId, { version = 1, kind = 'final', status = 'draft', subtotal = 0, total = 0, parentQuoteId = null } = {}) {
  const { rows } = await client.query(
    `insert into ns_quotes (job_id, version, kind, status, subtotal, total, parent_quote_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [jobId, version, kind, status, subtotal, total, parentQuoteId]
  );
  return rows[0];
}

export async function addLineItem(client, quoteId, serviceId, { description, quantity = 1, unit = 'sq_ft', unitRate = 0, modifierFactor = 1, addonsAmount = 0, computedAmount = 0, minimumApplied = false, amount = 0, pricingApproved = true, sortOrder = 1 } = {}) {
  const { rows } = await client.query(
    `insert into quote_line_items
       (quote_id, service_id, description, quantity, unit, unit_rate, modifier_factor,
        addons_amount, computed_amount, minimum_applied, amount, pricing_approved, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [quoteId, serviceId, description, quantity, unit, unitRate, modifierFactor, addonsAmount, computedAmount, minimumApplied, amount, pricingApproved, sortOrder]
  );
  return rows[0];
}

/** Flips a draft quote to sent, bypassing mark_quote_sent's own notification/
 *  email-required logic -- for tests that need a "sent" quote as setup
 *  (e.g. acceptance tests) without that being the thing under test. */
export async function markSentDirect(client, quoteId) {
  await client.query(`update ns_quotes set status = 'sent', sent_at = now() where id = $1`, [quoteId]);
}
