import { supabase } from '../../../shared/supabase.js';

/* Single data-access boundary. Views never talk to Supabase directly, so the
   day this moves behind a Next.js route handler, only this file changes. */

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

/* ------------------------------------------------------------ reference -- */

export async function listServices({ onlyQuotable = false } = {}) {
  let q = supabase.from('services').select('*').eq('active', true).order('sort_order');
  if (onlyQuotable) q = q.eq('quotable', true);
  return unwrap(await q);
}

export async function listPricingRules() {
  return unwrap(await supabase
    .from('pricing_rules')
    .select('*, services(key,name,unit,category)')
    .is('effective_to', null)
    .order('service_id'));
}

export async function listModifiers() {
  return unwrap(await supabase
    .from('pricing_modifiers').select('*').eq('active', true)
    .order('group_key').order('sort_order'));
}

export async function listSiteFactors() {
  return unwrap(await supabase
    .from('site_factors').select('*').eq('active', true)
    .order('group_key').order('sort_order'));
}

export async function listInspectionFlags() {
  return unwrap(await supabase
    .from('inspection_flags').select('*').eq('active', true).order('sort_order'));
}

export async function listServiceFlagMap() {
  return unwrap(await supabase.from('service_inspection_flags').select('service_id,flag_id'));
}

export async function getSettings() {
  const rows = unwrap(await supabase.from('app_settings').select('key,value,description'));
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function updateSetting(key, value) {
  return unwrap(await supabase.from('app_settings')
    .update({ value }).eq('key', key).select().single());
}

export async function updatePricingRule(serviceId, { rate, minimum }) {
  // close the current rule and open a new one, so quotes already sent keep
  // the basis they were built on
  unwrap(await supabase.from('pricing_rules')
    .update({ effective_to: new Date().toISOString() })
    .eq('service_id', serviceId).is('effective_to', null));

  return unwrap(await supabase.from('pricing_rules')
    .insert({ service_id: serviceId, rate, minimum, note: 'Updated from admin settings' })
    .select().single());
}

export async function setServiceActive(serviceId, patch) {
  return unwrap(await supabase.from('services')
    .update(patch).eq('id', serviceId).select().single());
}

/* -------------------------------------------------------------- requests -- */

export async function listRequests(status = 'new') {
  let q = supabase.from('quote_requests')
    .select('*, customers(name,email,phone,preferred_contact), properties(address_line1,city,postal_code), quote_request_services(other_label, services(name,key))')
    .order('submitted_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  return unwrap(await q);
}

export async function getRequest(id) {
  return unwrap(await supabase.from('quote_requests')
    .select('*, customers(*), properties(*), quote_request_services(other_label, services(name,key))')
    .eq('id', id).single());
}

export async function convertRequestToJob(requestId) {
  return unwrap(await supabase.rpc('create_job_from_request', { p_request_id: requestId }));
}

export async function markRequestStatus(id, status) {
  const patch = { status };
  if (status === 'reviewed') patch.reviewed_at = new Date().toISOString();
  return unwrap(await supabase.from('quote_requests')
    .update(patch).eq('id', id).select().single());
}

/* ------------------------------------------------------------------ jobs -- */

export async function listJobs(status = 'all') {
  let q = supabase.from('ns_jobs')
    .select('*, customers(name,phone,email), properties(address_line1,city)')
    .order('updated_at', { ascending: false }).limit(200);
  if (status && status !== 'all') q = q.eq('status', status);
  return unwrap(await q);
}

/** Field console's schedule screen: jobs booked for today, with enough on
 *  each row (customer, address, time, latest quoted value) to decide what
 *  to do next without opening the job. Quotes come embedded per job --
 *  the caller picks the highest version for "quoted value" since a job can
 *  carry several. */
export async function listTodaysVisits() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return unwrap(await supabase.from('ns_jobs')
    .select('*, customers(name,phone,email), properties(address_line1,city,postal_code,latitude,longitude), ' +
            'ns_quotes(id,version,total,status)')
    .gte('scheduled_for', start.toISOString()).lt('scheduled_for', end.toISOString())
    .order('scheduled_for'));
}

export async function getJob(id) {
  return unwrap(await supabase.from('ns_jobs')
    .select('*, customers(*), properties(*)')
    .eq('id', id).single());
}

export async function updateJob(id, patch) {
  return unwrap(await supabase.from('ns_jobs')
    .update(patch).eq('id', id).select().single());
}

/** Property Passport lives on properties.passport (jsonb) -- this is a
 *  plain generic patch, same shape as updateJob/updateQuote. */
export async function updateProperty(id, patch) {
  return unwrap(await supabase.from('properties')
    .update(patch).eq('id', id).select().single());
}

export async function dashboardCounts() {
  const [requests, jobs] = await Promise.all([
    supabase.from('quote_requests').select('status').eq('status', 'new'),
    supabase.from('ns_jobs').select('status')
  ]);
  if (requests.error) throw new Error(requests.error.message);
  if (jobs.error) throw new Error(jobs.error.message);

  const byStatus = {};
  for (const row of jobs.data) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  return { newRequests: requests.data.length, jobsByStatus: byStatus, totalJobs: jobs.data.length };
}

/* -------------------------------------------------------------- sections -- */

export async function listSections(jobId) {
  return unwrap(await supabase.from('job_sections')
    .select('*').eq('job_id', jobId).order('sort_order'));
}

export async function createSection(jobId, section) {
  return unwrap(await supabase.from('job_sections')
    .insert({ job_id: jobId, ...section }).select().single());
}

export async function updateSection(id, patch) {
  return unwrap(await supabase.from('job_sections')
    .update(patch).eq('id', id).select().single());
}

export async function deleteSection(id) {
  return unwrap(await supabase.from('job_sections').delete().eq('id', id));
}

/* ---------------------------------------------------------- measurements -- */

export async function listMeasurements(jobId) {
  return unwrap(await supabase.from('job_measurements')
    .select('*, measurement_modifiers(modifier_id), job_measurement_addons(*)')
    .eq('job_id', jobId).order('sort_order'));
}

export async function createMeasurement(jobId, measurement) {
  return unwrap(await supabase.from('job_measurements')
    .insert({ job_id: jobId, ...measurement }).select().single());
}

export async function updateMeasurement(id, patch) {
  return unwrap(await supabase.from('job_measurements')
    .update(patch).eq('id', id).select().single());
}

export async function deleteMeasurement(id) {
  return unwrap(await supabase.from('job_measurements').delete().eq('id', id));
}

/** Replaces the modifier selection for one group without touching the others. */
export async function setMeasurementModifier(measurementId, groupModifierIds, newModifierId) {
  if (groupModifierIds.length) {
    unwrap(await supabase.from('measurement_modifiers')
      .delete().eq('measurement_id', measurementId).in('modifier_id', groupModifierIds));
  }
  if (newModifierId) {
    unwrap(await supabase.from('measurement_modifiers')
      .insert({ measurement_id: measurementId, modifier_id: newModifierId }));
  }
}

export async function addMeasurementAddon(measurementId, addon) {
  return unwrap(await supabase.from('job_measurement_addons')
    .insert({ measurement_id: measurementId, ...addon }).select().single());
}

export async function deleteMeasurementAddon(id) {
  return unwrap(await supabase.from('job_measurement_addons').delete().eq('id', id));
}

/* ------------------------------------------------------------ inspection -- */

export async function listJobFlags(jobId) {
  return unwrap(await supabase.from('job_inspection_flags')
    .select('flag_id,note').eq('job_id', jobId));
}

export async function setJobFlag(jobId, flagId, on) {
  if (on) {
    return unwrap(await supabase.from('job_inspection_flags')
      .upsert({ job_id: jobId, flag_id: flagId }, { onConflict: 'job_id,flag_id' }));
  }
  return unwrap(await supabase.from('job_inspection_flags')
    .delete().eq('job_id', jobId).eq('flag_id', flagId));
}

/* ----------------------------------------------------------- attachments -- */

export async function listAttachments(jobId) {
  return unwrap(await supabase.from('job_attachments')
    .select('*').eq('job_id', jobId).order('created_at'));
}

/** Private bucket: a short-lived signed URL is minted per view. Defaults to
 *  the customer-upload bucket for existing callers; the field console's own
 *  site photos live in the separate 'job-photos' bucket. */
export async function signedPhotoUrl(storagePath, seconds = 900, bucket = 'request-photos') {
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(storagePath, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Uploads a staff-captured site photo to the private 'job-photos' bucket
 *  and records it as a job_attachments row. kind is one of site_photo |
 *  before | after | damage | measurement | document. */
export async function uploadJobPhoto(jobId, file, { kind = 'site_photo', caption, elevationTag, issueFlag = false } = {}) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('job-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  return unwrap(await supabase.from('job_attachments').insert({
    job_id: jobId, storage_path: path, kind,
    caption: caption || null, elevation_tag: elevationTag || null,
    issue_flag: !!issueFlag, mime_type: file.type || null, size_bytes: file.size ?? null
  }).select().single());
}

export async function updateAttachment(id, patch) {
  return unwrap(await supabase.from('job_attachments').update(patch).eq('id', id).select().single());
}

export async function deleteAttachment(id) {
  return unwrap(await supabase.from('job_attachments').delete().eq('id', id));
}

/* ----------------------------------------------------------------- notes -- */

export async function listNotes(jobId) {
  return unwrap(await supabase.from('job_notes')
    .select('*').eq('job_id', jobId).order('created_at', { ascending: false }));
}

export async function addNote(jobId, body, visibility = 'internal') {
  return unwrap(await supabase.from('job_notes')
    .insert({ job_id: jobId, body, visibility }).select().single());
}

/* --------------------------------------------------------------- pricing -- */

export async function calculatePricing(jobId) {
  return unwrap(await supabase.rpc('calculate_job_pricing', { p_job_id: jobId }));
}

/* ---------------------------------------------------------------- quotes -- */

export async function listQuotes(jobId) {
  // line items, adjustments and change orders must come with the quote --
  // the builder renders them, and selecting '*' alone silently produced an
  // empty-looking quote
  return unwrap(await supabase.from('ns_quotes')
    .select('*, quote_line_items(*), quote_adjustments(*), ns_change_orders(*)')
    .eq('job_id', jobId)
    .order('version', { ascending: false }));
}

export async function getQuote(id) {
  return unwrap(await supabase.from('ns_quotes')
    .select('*, quote_line_items(*), quote_adjustments(*), ns_jobs(*, customers(*), properties(*))')
    .eq('id', id).single());
}

export async function createQuoteFromCalculation(jobId, kind = 'final') {
  return unwrap(await supabase.rpc('create_quote_from_calculation', {
    p_job_id: jobId, p_kind: kind
  }));
}

/** One sibling of an option group (Phase C) -- measurementIds is an
 *  explicit subset of this job's job_measurements, never auto-derived. */
export async function createOptionQuote(jobId, optionGroupId, optionLabel, optionSortOrder, measurementIds, kind = 'final') {
  return unwrap(await supabase.rpc('create_option_quote', {
    p_job_id: jobId, p_option_group_id: optionGroupId, p_option_label: optionLabel,
    p_option_sort_order: optionSortOrder, p_measurement_ids: measurementIds, p_kind: kind
  }));
}

/** Sends every sibling in the group at once, in a single customer email --
 *  see mark_quote_sent's own guard for why sendQuote() refuses an
 *  option-group member directly. */
export async function sendOptionGroup(optionGroupId) {
  return unwrap(await supabase.rpc('send_option_group', { p_option_group_id: optionGroupId }));
}

export async function addAdjustment(quoteId, adjustment) {
  const row = unwrap(await supabase.from('quote_adjustments')
    .insert({ quote_id: quoteId, ...adjustment }).select().single());
  await recalcQuote(quoteId);
  return row;
}

export async function deleteAdjustment(id, quoteId) {
  unwrap(await supabase.from('quote_adjustments').delete().eq('id', id));
  await recalcQuote(quoteId);
}

export async function addManualLine(quoteId, line) {
  const row = unwrap(await supabase.from('quote_line_items')
    .insert({ quote_id: quoteId, source: 'manual', ...line }).select().single());
  await recalcQuote(quoteId);
  return row;
}

export async function deleteLine(id, quoteId) {
  unwrap(await supabase.from('quote_line_items').delete().eq('id', id));
  await recalcQuote(quoteId);
}

export async function recalcQuote(quoteId) {
  return unwrap(await supabase.rpc('recalculate_quote_totals', { p_quote_id: quoteId }));
}

export async function updateQuote(id, patch) {
  return unwrap(await supabase.from('ns_quotes')
    .update(patch).eq('id', id).select().single());
}

export async function sendQuote(id) {
  return unwrap(await supabase.rpc('mark_quote_sent', { p_quote_id: id }));
}

/** Clones a quote's pricing (line items + adjustments, copied verbatim) into
 *  a new draft version. Returns the new quote's id. */
export async function duplicateQuote(id) {
  return unwrap(await supabase.rpc('duplicate_quote', { p_quote_id: id }));
}

/* ------------------------------------------------------------ signatures -- */

/** Uploads the signature PNG under job-photos/<job>/signatures/... -- a
 *  distinct prefix, not a job_attachments row, because a signature isn't a
 *  tagged site photo, it's a field on the quote. That prefix is the one
 *  thing in this private bucket an anonymous quote.html reader can fetch
 *  (see the "public reads quote signatures" storage policy). Returns the
 *  storage path, not a URL -- see ns_quotes.signature_url's comment. */
export async function uploadSignature(jobId, pngBlob) {
  const path = `${jobId}/signatures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage
    .from('job-photos').upload(path, pngBlob, { contentType: 'image/png' });
  if (error) throw new Error(error.message);
  return path;
}

/** Records the signature and moves the quote to 'accepted' -- works whether
 *  the quote was ever emailed or not (signed live, same visit, is a
 *  complete path of its own). See save_quote_signature() for the exact
 *  state transition. */
export async function saveQuoteSignature(quoteId, signaturePath, signedByName) {
  return unwrap(await supabase.rpc('save_quote_signature', {
    p_quote_id: quoteId, p_signature_path: signaturePath, p_signed_by_name: signedByName
  }));
}

/* --------------------------------------------------------- change orders -- */

export async function listChangeOrders(quoteId) {
  return unwrap(await supabase.from('ns_change_orders')
    .select('*').eq('quote_id', quoteId).order('created_at'));
}

export async function addChangeOrder(quoteId, { description, amount }) {
  return unwrap(await supabase.from('ns_change_orders')
    .insert({ quote_id: quoteId, description, amount }).select().single());
}

/** approved | declined. Approving does NOT touch ns_quotes.total -- see the
 *  ns_change_orders migration note. The caller sums approved amounts
 *  wherever a combined "quote + approved changes" figure is needed. */
export async function setChangeOrderStatus(id, status) {
  const patch = { status };
  if (status === 'approved') patch.approved_at = new Date().toISOString();
  return unwrap(await supabase.from('ns_change_orders')
    .update(patch).eq('id', id).select().single());
}

export async function deleteChangeOrder(id) {
  return unwrap(await supabase.from('ns_change_orders').delete().eq('id', id));
}

/* -------------------------------------------------------------- seasonal -- */

/** A customer's past quote for a seasonal (lighting) service, one per
 *  customer+service, so the renewals screen can offer "last winter you did
 *  X for them, want to re-quote it for this season" without re-deriving
 *  that from raw quote history inline. category is the services.category
 *  this counts as seasonal -- currently just 'lighting' (Christmas +
 *  permanent outdoor), since winter_property_care is an ongoing-season
 *  service that renews on a schedule, not a once-a-year re-quote. */
export async function listSeasonalQuoteHistory() {
  return unwrap(await supabase.from('ns_quotes')
    .select('id,version,status,total,created_at,sent_at,' +
            'ns_jobs(id,customer_id,property_id,customers(name,phone,email),properties(address_line1,city)),' +
            'quote_line_items(service_id,description,services(key,name,category))')
    .in('status', ['sent', 'accepted', 'declined', 'expired', 'superseded'])
    .order('created_at', { ascending: false })
    .limit(500));
}

/* -------------------------------------------------------- snow / winter --- */

export async function listSnowEvents() {
  return unwrap(await supabase.from('ns_snow_events').select('*').order('event_date', { ascending: false }));
}

export async function addSnowEvent({ eventDate, accumulationCm, notes }) {
  return unwrap(await supabase.from('ns_snow_events')
    .insert({ event_date: eventDate, accumulation_cm: accumulationCm ?? null, notes: notes || null })
    .select().single());
}

export async function deleteSnowEvent(id) {
  return unwrap(await supabase.from('ns_snow_events').delete().eq('id', id));
}

export async function listPropertyClears(eventId) {
  let q = supabase.from('ns_property_clears')
    .select('*, properties(address_line1,city)').order('cleared_at', { ascending: false });
  if (eventId) q = q.eq('event_id', eventId);
  return unwrap(await q);
}

export async function logPropertyClear({ propertyId, eventId, saltAppliedKg, notes }) {
  return unwrap(await supabase.from('ns_property_clears').insert({
    property_id: propertyId, event_id: eventId || null,
    salt_applied_kg: saltAppliedKg ?? null, notes: notes || null
  }).select().single());
}

/** Properties, for the "log a clear" picker -- deliberately simple (every
 *  property, not just ones with a past winter job) so a brand-new winter
 *  client can still be logged on their first clear. */
export async function listWinterProperties() {
  return unwrap(await supabase.from('properties')
    .select('id,address_line1,city,customers(name)')
    .order('address_line1').limit(500));
}
