import { createClient } from './vendor/@supabase/supabase-js/dist/index.js';

/* Shared by the public site and the admin tool so the project reference and
   key can never drift between the two.

   The publishable (anon) key is safe in the browser: anon has no table grants
   except the public service menu and two whitelisted settings keys. Everything
   else is denied before RLS is even consulted, and writes go through
   submit_quote_request() which validates server-side. */
export const SUPABASE_URL = 'https://xrgutmdgjzclaeyugsqg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_sh-M40urSjGvRODkAP7mFg_itg8ZUfY';

// Source and staged copies can resolve to different module URLs in dev.
// Reuse one client per JS realm/configuration, including its auth lock/timer.
// Assignment happens only after construction succeeds, allowing startup Retry.
const clientsKey = Symbol.for('nova-shield.supabase.clients');
const clients = globalThis[clientsKey] ||= new Map();
const clientKey = `${SUPABASE_URL}|${SUPABASE_ANON_KEY}`;
export const supabase = clients.get(clientKey) || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
clients.set(clientKey, supabase);

/** Resolves the signed-in user and whether they are an admin. */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, isAdmin: false };

  const { data, error } = await supabase.rpc('is_admin');
  if (error) return { session, isAdmin: false, error };
  return { session, isAdmin: data === true };
}
