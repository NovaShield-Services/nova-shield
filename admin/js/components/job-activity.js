/* Turns the normalized events from the job_activity RPC into display rows.
 *
 * The split is deliberate: the RPC knows the schema and does the gathering
 * (one query across nine tables); this module owns the wording, grouping and
 * ordering, which is the part worth unit-testing. Neither invents an event.
 *
 * WHAT CANNOT BE SHOWN, AND WHY
 *
 *   "viewed" / read receipts   no viewed_at column exists anywhere
 *   quote superseded           no superseded_at. Supersession is a status
 *                              with no recorded time, so it appears as
 *                              context on the quote's own entry
 *                              ("later superseded") rather than as a dated
 *                              event in the wrong place
 *   replies / calls / texts    nothing persists them. The SMS and tel links
 *   "on my way"                are launchers that record nothing
 *
 * ACTORS
 *
 * actor_id is a bare auth.users uuid. The browser cannot read auth.users and
 * admin_users holds only user_id, so there is no name to show. The only real
 * name in the schema is ns_quotes.signed_by_name, typed by the customer, and
 * it arrives as actor_name. Anything else resolves to "you" (when it matches
 * the signed-in admin) or "a staff member" -- never a fabricated name.
 */

export const SOURCE_LABELS = {
  quote_requests: 'Request',
  ns_jobs: 'Job',
  ns_quotes: 'Quote',
  job_notes: 'Note',
  notifications: 'Email',
  ns_change_orders: 'Change order',
  job_attachments: 'Photo',
  job_inspection_flags: 'Inspection',
  job_measurements: 'Measurement'
};

/* One entry per kind the RPC can emit. `tone` maps to the existing badge
   vocabulary (ok / warn / muted) rather than inventing colours, and is
   chosen so a loss never reads as a win: declined and overdue-ish events are
   never 'ok'. */
const EVENT_KINDS = {
  request_received:      { label: 'Request received',            tone: 'muted' },
  request_reviewed:      { label: 'Request reviewed',            tone: 'muted' },
  job_created:           { label: 'Job created',                 tone: 'muted' },
  scheduled_for:         { label: 'Booked for',                  tone: 'warn'  },
  job_completed:         { label: 'Job completed',               tone: 'ok'    },
  quote_created:         { label: 'Quote created',               tone: 'muted' },
  quote_revised:         { label: 'Quote revised',               tone: 'muted' },
  quote_sent:            { label: 'Quote sent to customer',      tone: 'warn'  },
  quote_accepted:        { label: 'Quote accepted',              tone: 'ok'    },
  quote_declined:        { label: 'Quote declined',              tone: 'warn'  },
  quote_signed:          { label: 'Quote signed',                tone: 'ok'    },
  note_added:            { label: 'Note added',                  tone: 'muted' },
  notification_queued:   { label: 'Email queued',                tone: 'muted' },
  notification_sent:     { label: 'Email sent',                  tone: 'muted' },
  change_order_raised:   { label: 'Change order raised',         tone: 'warn'  },
  change_order_approved: { label: 'Change order approved',       tone: 'ok'    },
  change_order_declined: { label: 'Change order declined',       tone: 'warn'  },
  photo_added:           { label: 'Photo added',                 tone: 'muted' },
  inspection_flag:       { label: 'Inspection finding',          tone: 'warn'  },
  measurement_added:     { label: 'Measurement added',           tone: 'muted' }
};

function money(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
    : null;
}

/** Short, factual second line. Only ever built from fields the event carries. */
function describe(kind, detail = {}) {
  const parts = [];
  switch (kind) {
    case 'request_received':
      if (detail.channel) parts.push(`via ${detail.channel}`);
      if (detail.preferred_schedule) parts.push(`prefers ${detail.preferred_schedule}`);
      break;
    case 'request_reviewed':
      if (detail.status) parts.push(`now ${detail.status}`);
      break;
    case 'job_created':
      if (detail.reference) parts.push(detail.reference);
      break;
    case 'scheduled_for':
      // The date itself is the timestamp; say plainly that this is a target,
      // because nothing records WHEN the booking was made.
      parts.push('scheduled date — the system does not record when it was booked');
      break;
    case 'quote_created':
    case 'quote_revised': {
      if (detail.version) parts.push(`v${detail.version}`);
      if (detail.option_label) parts.push(detail.option_label);
      const t = money(detail.total);
      if (t) parts.push(t);
      // Supersession has no timestamp of its own, so it is reported here.
      if (detail.current_status === 'superseded') parts.push('later superseded');
      if (detail.current_status === 'expired') parts.push('later expired');
      break;
    }
    case 'quote_sent':
    case 'quote_accepted':
    case 'quote_declined': {
      if (detail.version) parts.push(`v${detail.version}`);
      if (detail.option_label) parts.push(detail.option_label);
      const t = money(detail.total);
      if (t) parts.push(t);
      break;
    }
    case 'quote_signed':
      if (detail.version) parts.push(`v${detail.version}`);
      break;
    case 'note_added':
      parts.push(detail.visibility === 'customer' ? 'customer-visible' : 'internal');
      break;
    case 'notification_queued':
    case 'notification_sent':
      if (detail.subject) parts.push(detail.subject);
      else if (detail.notification_kind) parts.push(detail.notification_kind);
      if (detail.status && detail.status !== 'sent') parts.push(detail.status);
      break;
    case 'change_order_raised':
    case 'change_order_approved':
    case 'change_order_declined': {
      if (detail.description) parts.push(detail.description);
      const a = money(detail.amount);
      if (a) parts.push(a);
      break;
    }
    case 'photo_added':
      if (detail.photo_kind) parts.push(detail.photo_kind);
      if (detail.elevation_tag) parts.push(detail.elevation_tag);
      if (detail.from_request) parts.push('from the customer’s request');
      if (detail.caption) parts.push(detail.caption);
      break;
    case 'inspection_flag':
      if (detail.flag) parts.push(detail.flag);
      if (detail.note) parts.push(detail.note);
      else parts.push('no note recorded');
      break;
    case 'measurement_added':
      if (detail.service) parts.push(detail.service);
      if (detail.quantity !== undefined && detail.quantity !== null) parts.push(String(detail.quantity));
      if (detail.review_required) {
        parts.push(detail.review_reason ? `flagged: ${detail.review_reason}` : 'flagged for review');
      }
      break;
    default:
      break;
  }
  return parts.filter(Boolean).join(' · ');
}

/** Who did it, as far as the system genuinely knows. */
function actorLabel(event, currentUserId) {
  if (event.actor_name) return event.actor_name;          // signed_by_name only
  if (!event.actor_id) return null;                        // genuinely unknown
  return event.actor_id === currentUserId ? 'you' : 'a staff member';
}

/** Maps RPC events to display rows, newest first.
 *
 *  Sorting here as well as in SQL is deliberate: it makes ordering a property
 *  of this module that a test can pin down, and it is idempotent.
 *
 *  An unrecognised kind is passed through with a humanised label rather than
 *  dropped — if the RPC ever learns a new real event, it should appear rather
 *  than silently vanish, and it must not be relabelled as something it isn't. */
export function activityRows(events, { currentUserId = null } = {}) {
  if (!Array.isArray(events)) return [];

  return events
    .filter((e) => e && e.at)                 // an undated event cannot be placed
    .map((e) => {
      const known = EVENT_KINDS[e.kind];
      return {
        kind: e.kind,
        known: !!known,
        label: known ? known.label : String(e.kind || 'Activity').replace(/_/g, ' '),
        tone: known ? known.tone : 'muted',
        at: e.at,
        source: e.source || null,
        sourceLabel: SOURCE_LABELS[e.source] || null,
        detail: describe(e.kind, e.detail || {}),
        actor: actorLabel(e, currentUserId),
        // Notes are the one event type whose audience matters on screen, so
        // the renderer can style internal and customer-visible differently.
        visibility: e.kind === 'note_added' ? (e.detail?.visibility || 'internal') : null,
        body: e.kind === 'note_added' ? (e.detail?.body || '') : null,
        isTargetDate: e.kind === 'scheduled_for'
      };
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** Groups rows by local calendar day, preserving the newest-first order, so
 *  the timeline reads as days rather than one undifferentiated list. */
export function groupByDay(rows) {
  const out = [];
  for (const row of rows) {
    const d = new Date(row.at);
    const key = Number.isNaN(d.getTime())
      ? 'unknown'
      : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else out.push({ key, at: row.at, rows: [row] });
  }
  return out;
}
