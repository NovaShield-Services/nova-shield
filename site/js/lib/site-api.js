import { supabase } from '../../../shared/supabase.js';

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

/** Calls the validated RPC. Never writes to a table directly. */
export async function submitQuoteRequest(payload) {
  const { data, error } = await supabase.rpc('submit_quote_request', {
    p_name: payload.name,
    p_email: payload.email || null,
    p_phone: payload.phone || null,
    p_preferred_contact: payload.preferredContact || null,
    p_address: payload.address,
    p_city: payload.city || null,
    p_postal_code: payload.postalCode || null,
    p_property_type: payload.propertyType || null,
    p_service_keys: payload.serviceKeys || [],
    p_other_service: payload.otherService || null,
    p_message: payload.message || null,
    p_preferred_schedule: payload.preferredSchedule || null,
    p_website: payload.honeypot || null
  });

  if (error) {
    // the RPC raises friendly, customer-safe messages for validation failures
    throw new Error(error.message || 'We could not send that request.');
  }
  return data; // request uuid
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
