/* What needs to happen next on this job, derived entirely from rows that
 * already exist. This is a read-only projection, not a workflow engine: it
 * stores nothing, gates nothing, and never writes. The job status dropdown
 * remains the operator's to set -- this only answers "what am I looking at
 * and what is outstanding", which the job page previously left to a
 * free-form 15-value select with no ordering hint.
 *
 * Every rule below maps to a real column:
 *   ns_jobs.status, ns_jobs.scheduled_for, ns_jobs.completed_at
 *   job_measurements (existence), job_measurements.review_required
 *   job_sections.review_required
 *   job_inspection_flags.note
 *   ns_quotes.status / .version, quote_line_items.pricing_approved
 *   quote_requests via ns_jobs.request_id
 *
 * Deliberately absent: anything resembling "inspection complete". There is
 * no such column -- inspection_flags has only key/name/warning/active/
 * sort_order -- so claiming an inspection is incomplete would be inventing
 * state. What IS real is a flag that was ticked without saying why, so that
 * is what gets surfaced instead.
 */

export const STEP_DONE = 'done';
export const STEP_NOW = 'now';
export const STEP_LATER = 'later';

function latestQuote(quotes) {
  if (!quotes || !quotes.length) return null;
  // Option-group members are siblings, not revisions, so "latest" is by
  // version across the job; ties keep the first, which is stable enough for
  // a status hint.
  return quotes.reduce((a, b) => (Number(b.version) > Number(a.version) ? b : a));
}

/** Ordered checklist for a job. Each entry is
 *  { key, label, detail, state } with exactly one 'now' at most -- the
 *  first unmet step. Everything before it reads 'done', everything after
 *  'later', so the caller can render a ladder or just the current step. */
export function jobSteps({ job, measurements = [], sections = [], quotes = [], jobFlags = [] } = {}) {
  if (!job) return [];

  const hasRequest = !!(job.request_id || job.quote_requests);
  const measurementCount = measurements.length;
  const flaggedForReview = [
    ...measurements.filter((m) => m.review_required),
    ...sections.filter((s) => s.review_required)
  ];
  const flagsWithoutNote = jobFlags.filter((f) => !(f.note && String(f.note).trim()));
  const quote = latestQuote(quotes);
  const quoteStatus = quote?.status || null;
  const unapprovedLines = (quote?.quote_line_items || [])
    .filter((l) => l.pricing_approved === false);
  const accepted = (quotes || []).some((q) => q.status === 'accepted');
  const scheduled = !!job.scheduled_for;
  const scheduledInPast = scheduled && new Date(job.scheduled_for) < new Date();
  const completed = !!job.completed_at;

  /* Each rule is { key, label, detail, met } in workflow order. `met` means
     "this step has nothing outstanding", which is what drives done/now/later. */
  const rules = [
    hasRequest && {
      key: 'review-request',
      label: 'Review what the customer asked for',
      detail: 'This job came from a website request. Check the requested services below before measuring.',
      met: job.status !== 'reviewing'
    },
    {
      key: 'measure',
      label: 'Add measurements',
      detail: 'No measurements on this job yet, so there is nothing to price.',
      met: measurementCount > 0
    },
    flaggedForReview.length > 0 && {
      key: 'review-flags',
      label: `Resolve ${flaggedForReview.length} item${flaggedForReview.length === 1 ? '' : 's'} flagged for review`,
      detail: 'Someone marked these as needing a second look. Clear the flags before quoting.',
      met: false
    },
    flagsWithoutNote.length > 0 && {
      key: 'flag-notes',
      label: `Describe ${flagsWithoutNote.length} flagged condition${flagsWithoutNote.length === 1 ? '' : 's'}`,
      detail: 'An inspection check is ticked with no note saying what was seen.',
      met: false
    },
    {
      key: 'build-quote',
      label: 'Build a quote',
      detail: 'Measurements are in. Produce a quote from the calculated price.',
      met: !!quote
    },
    unapprovedLines.length > 0 && {
      key: 'approve-pricing',
      label: 'Pricing needs approval before this can be accepted',
      detail: `${unapprovedLines.length} line${unapprovedLines.length === 1 ? '' : 's'} on the latest quote ` +
              'are provisional. The customer cannot accept it until they are approved.',
      met: false
    },
    {
      key: 'send-quote',
      label: 'Send the quote',
      detail: 'The quote is still a draft — the customer has not seen it.',
      met: !!quote && quoteStatus !== 'draft'
    },
    {
      key: 'await-customer',
      label: 'Waiting on the customer',
      detail: 'The quote has been sent. Nothing to do here until they respond.',
      met: quoteStatus !== 'sent'
    },
    accepted && {
      key: 'schedule',
      label: 'Book the work in',
      detail: 'The quote is accepted but no date is set, so it will not appear on the field schedule.',
      met: scheduled
    },
    accepted && scheduled && !completed && {
      key: 'field-work',
      label: scheduledInPast ? 'Site visit date has passed' : 'Ready for field work',
      detail: scheduledInPast
        ? 'The scheduled date is in the past and the job is not marked complete.'
        : 'Scheduled and ready. The field console will show it on the day.',
      met: false
    },
    (job.status === 'in_progress' || scheduledInPast) && {
      key: 'complete',
      label: 'Record completion',
      detail: 'Mark the job complete so it gets a completion timestamp and a report.',
      met: completed
    }
  ].filter(Boolean);

  const firstUnmet = rules.findIndex((r) => !r.met);
  return rules.map((r, i) => ({
    key: r.key,
    label: r.label,
    detail: r.detail,
    state: r.met ? STEP_DONE : (i === firstUnmet ? STEP_NOW : STEP_LATER)
  }));
}

/** The single step to put in front of the operator, or null when the job is
 *  genuinely finished / waiting on someone else. */
export function currentStep(args) {
  return jobSteps(args).find((s) => s.state === STEP_NOW) || null;
}
