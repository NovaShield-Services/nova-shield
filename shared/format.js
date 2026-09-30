const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const QTY = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 });

/** Always takes a number, never a string scraped out of the DOM. */
export function money(value) {
  const n = Number(value);
  return CAD.format(Number.isFinite(n) ? n : 0);
}

export function qty(value) {
  const n = Number(value);
  return QTY.format(Number.isFinite(n) ? n : 0);
}

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function date(value, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA', opts);
}

export function dateTime(value) {
  return date(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const UNIT_LABELS = {
  sq_ft: 'sq ft',
  linear_ft: 'linear ft',
  each: 'each',
  fixed: 'fixed'
};

export function unitLabel(unit) {
  return UNIT_LABELS[unit] || unit || '';
}

/** "new" -> "New", "quote_sent" -> "Quote sent" */
export function humanise(key) {
  if (!key) return '';
  const s = String(key).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
