import { supabase, SUPABASE_URL } from '../../../shared/supabase.js';

/* Public-site data access. Everything here runs as the anonymous role, which
   can read only the service menu and two settings keys, and can write only
   through submit_quote_request(). */

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

let servicesCache = null;
let settingsCache = null;

/** Customer-pickable services. Jump-wire lines have a parent_key and are
    internal pricing components, so they never appear on the website. */
export async function listPublicServices() {
  if (servicesCache) return servicesCache;
  const rows = unwrap(await supabase
    .from('services')
    .select('id,key,name,category,unit,blurb,detail,quotable,parent_key')
    .eq('active', true)
    .is('parent_key', null)
    .order('sort_order'));
  servicesCache = rows;
  return rows;
}

export async function getService(key) {
  const services = await listPublicServices();
  return services.find(s => s.key === key) || null;
}

export async function getPublicSettings() {
  if (settingsCache) return settingsCache;
  const rows = unwrap(await supabase.from('app_settings').select('key,value'));
  settingsCache = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return settingsCache;
}

/** Submits through the Turnstile-gated endpoint, which verifies the token
    server-side and then calls the same validated RPC as before. The anon role
    never writes to a table directly. */
export async function submitQuoteRequest(payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      preferredContact: payload.preferredContact || null,
      address: payload.address,
      city: payload.city || null,
      postalCode: payload.postalCode || null,
      propertyType: payload.propertyType || null,
      serviceKeys: payload.serviceKeys || [],
      otherService: payload.otherService || null,
      message: payload.message || null,
      preferredSchedule: payload.preferredSchedule || null,
      honeypot: payload.honeypot || null,
      turnstileToken: payload.turnstileToken || null
    })
  });

  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }

  if (!res.ok) {
    // the endpoint and the RPC both return customer-safe messages
    throw new Error(body?.error || 'We could not send that request. Please call or text us.');
  }
  return body.requestId;
}

const SAFE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
                   'image/heic': 'heic', 'image/heif': 'heif' };

/** Uploads one photo then links it to the request. Returns false on failure so
    a bad photo never loses the customer's whole submission. */
export async function uploadRequestPhoto(requestId, file) {
  const ext = SAFE_EXT[file.type];
  if (!ext) return false;
  if (file.size > 10 * 1024 * 1024) return false;

  const path = `requests/${requestId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('request-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return false;

  const { error: linkError } = await supabase.rpc('attach_request_photo', {
    p_request_id: requestId, p_path: path, p_mime: file.type, p_size: file.size
  });
  return !linkError;
}
