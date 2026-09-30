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

export async function getJob(id) {
  return unwrap(await supabase.from('ns_jobs')
    .select('*, customers(*), properties(*)')
    .eq('id', id).single());
}

export async function updateJob(id, patch) {
  return unwrap(await supabase.from('ns_jobs')
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

/** Private bucket: a short-lived signed URL is minted per view. */
export async function signedPhotoUrl(storagePath, seconds = 900) {
  const { data, error } = await supabase.storage
    .from('request-photos').createSignedUrl(storagePath, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
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
  // line items and adjustments must come with the quote -- the builder renders
  // them, and selecting '*' alone silently produced an empty-looking quote
  return unwrap(await supabase.from('ns_quotes')
    .select('*, quote_line_items(*), quote_adjustments(*)')
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
